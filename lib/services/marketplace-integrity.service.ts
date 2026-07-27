/**
 * LD-506 marketplace integrity checks.
 *
 * These sit between a contribution and a payout. See
 * lib/constants/marketplace-integrity.ts for why each control exists and why
 * they are layered rather than combined.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import { UserFacingError } from '@/lib/actions/action-result'
import {
  MAX_CONTRIBUTIONS_PER_POOL_PER_WINDOW,
  MAX_CONTRIBUTIONS_PER_WINDOW,
  PAYOUT_REVIEW_THRESHOLD_CENTS,
  VELOCITY_WINDOW_HOURS,
  type AssuranceMix,
} from '@/lib/constants/marketplace-integrity'

// These extend UserFacingError because the message is the whole response. A
// person who hits a velocity limit or a duplicate needs to be told which, and
// an error thrown out of a server action reaches production as framework
// boilerplate unless it is marked.
export class ContributionVelocityError extends UserFacingError {
  constructor(message: string) {
    super(message, 'contribution_velocity')
    this.name = 'ContributionVelocityError'
  }
}

export class DuplicateContributionError extends UserFacingError {
  constructor(message = 'You have already contributed that entry to this pool') {
    super(message, 'duplicate_contribution')
    this.name = 'DuplicateContributionError'
  }
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * Recognise the duplicate-contribution index firing.
 *
 * The database is the control; this only turns its error into something a
 * person can act on. Matching the index by name rather than the message keeps
 * it from swallowing an unrelated unique violation.
 */
export function isDuplicateContribution(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  if (candidate.code !== UNIQUE_VIOLATION) return false
  return candidate.message?.includes('uq_pool_contrib_entry_once') ?? false
}

/**
 * Refuse a contribution when the person is moving faster than a person does.
 *
 * Counted from `pool_contributions` rather than from the LD-109 rate limiter on
 * purpose. That limiter fails open, which is the right choice for a throttle
 * and the wrong one for a control standing in front of money: a store outage
 * would silently remove the limit. Counting the rows themselves cannot fail
 * open, because if the table is unreachable the insert fails too.
 */
export async function assertContributionVelocity(
  userId: string,
  poolId: string
): Promise<void> {
  const service = createServiceClient()
  const since = new Date(Date.now() - VELOCITY_WINDOW_HOURS * 3600_000).toISOString()

  const { count: poolCount, error: poolError } = await service
    .from('pool_contributions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('pool_id', poolId)
    .gte('created_at', since)
  if (poolError) throw poolError

  if ((poolCount ?? 0) >= MAX_CONTRIBUTIONS_PER_POOL_PER_WINDOW) {
    throw new ContributionVelocityError(
      'You have contributed a lot to this pool today. Try again tomorrow.'
    )
  }

  const { count: totalCount, error: totalError } = await service
    .from('pool_contributions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  if (totalError) throw totalError

  if ((totalCount ?? 0) >= MAX_CONTRIBUTIONS_PER_WINDOW) {
    throw new ContributionVelocityError(
      'You have contributed a lot today. Try again tomorrow.'
    )
  }
}

/**
 * Whether a balance about to be transferred should wait for review.
 *
 * Deliberately a pure function of the amount. Anything cleverer belongs in a
 * review queue, where a person can look at it, rather than in an automatic
 * decision that quietly withholds someone's money.
 */
export function shouldHoldPayout(balanceCents: number): boolean {
  return balanceCents >= PAYOUT_REVIEW_THRESHOLD_CENTS
}

export const PAYOUT_HOLD_REASON =
  'This payout is larger than usual and is being reviewed before it is sent.'

/**
 * Put a user's pending payouts into review.
 *
 * Held rather than failed: the money is still owed, and the contributor sees it
 * as held with the reason rather than as missing.
 */
export async function holdPayoutsForReview(
  userId: string,
  payoutIds: string[],
  balanceCents: number
): Promise<void> {
  if (payoutIds.length === 0) return
  const service = createServiceClient()

  const { error } = await service
    .from('payouts')
    .update({
      status: 'held',
      held_reason: PAYOUT_HOLD_REASON,
      held_at: new Date().toISOString(),
    })
    .in('id', payoutIds)
    .eq('status', 'pending')
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'payout_held',
    action: 'A payout was held for review',
    metadata: {
      payout_count: payoutIds.length,
      balance_cents: balanceCents,
      threshold_cents: PAYOUT_REVIEW_THRESHOLD_CENTS,
    },
  })
}

/** Return a held payout to the pending queue after a review clears it. */
export async function releaseHeldPayouts(userId: string): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payouts')
    .update({
      status: 'pending',
      held_reason: null,
      released_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'held')
    .select('id')
  if (error) throw error

  const released = data?.length ?? 0
  if (released > 0) {
    await createAuditEntry({
      userId,
      eventType: 'payout_released',
      action: 'A held payout was released after review',
      metadata: { payout_count: released },
    })
  }
  return released
}

/**
 * How much of a pool an organization has vouched for.
 *
 * Reads counts through a SECURITY DEFINER function so no contributed value
 * crosses this boundary. A failure returns an empty mix rather than throwing,
 * because a buyer should still see the rest of the evaluation surface.
 */
export async function getPoolAssuranceMix(poolId: string): Promise<AssuranceMix> {
  const empty: AssuranceMix = { issuerVouched: 0, providerSourced: 0, selfAsserted: 0 }
  try {
    const service = createServiceClient()
    const { data, error } = await service.rpc('pool_assurance_mix', { p_pool_id: poolId })
    if (error) throw error

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return empty

    return {
      issuerVouched: Number(row.issuer_vouched ?? 0),
      providerSourced: Number(row.provider_sourced ?? 0),
      selfAsserted: Number(row.self_asserted ?? 0),
    }
  } catch (error) {
    errorLogger.log(error, ErrorSeverity.LOW, {
      action: 'POOL_ASSURANCE_MIX_UNAVAILABLE',
      resource: 'data_pools',
    })
    return empty
  }
}
