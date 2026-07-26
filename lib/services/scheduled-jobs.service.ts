/**
 * LD-601 scheduled job runner.
 *
 * Periodic work that has no request to hang off. Every job here is idempotent:
 * running it twice produces the same result, so a retried or overlapping
 * invocation is safe.
 *
 * Jobs:
 *   payout_retries   retry failed contributor transfers with exponential backoff
 *   consent_expiry   mark consent grants whose window has closed
 *   share_expiry     mark credential share tokens whose window has closed
 *   rate_limit_purge drop counters from windows that can no longer be consulted
 *   retention_purge  destroy records past their stated retention window
 *
 * Connector token refresh is intentionally absent: there is no data_sources
 * table yet. LD-201 adds that job to JOB_NAMES when it lands.
 */

import { createServiceClient } from '@/lib/supabase/service'
import * as payoutRepo from '@/lib/repositories/payout.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { createAuditEntry } from '@/lib/services/audit.service'
import {
  notifyPayoutFailed,
  notifyPayoutPaid,
} from '@/lib/services/marketplace-notification.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import { purgeExpiredRateLimits } from '@/lib/services/rate-limit.service'
import { runRetentionPurges } from '@/lib/services/retention.service'
import { PAYOUT_THRESHOLD_CENTS } from '@/lib/constants/marketplace-economics'

export const JOB_NAMES = [
  'payout_retries',
  'consent_expiry',
  'share_expiry',
  'rate_limit_purge',
  'retention_purge',
] as const
export type JobName = (typeof JOB_NAMES)[number]

export interface JobResult {
  job: JobName
  processed: number
  failed: number
  error?: string
}

/** Attempts before a payout is given up on and the contributor is told. */
export const MAX_PAYOUT_ATTEMPTS = 6

/** Backoff floor and ceiling between payout attempts. */
const BASE_BACKOFF_MS = 5 * 60 * 1000 // 5 minutes
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000 // 1 day

/**
 * Exponential backoff for attempt N (1-based): 5m, 10m, 20m, 40m, 80m, ...
 * capped at one day. Pure so the schedule is directly testable.
 */
export function backoffMsForAttempt(attempt: number): number {
  const exponent = Math.max(0, attempt - 1)
  return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS)
}

async function poolNameFor(
  poolId: string | null,
  cache: Map<string, string>
): Promise<string> {
  if (!poolId) return 'a data pool'
  const cached = cache.get(poolId)
  if (cached) return cached
  const pool = await poolRepo.findPoolById(poolId).catch(() => null)
  const name = pool?.name ?? 'a data pool'
  cache.set(poolId, name)
  return name
}

/**
 * Retry every pending payout that is due. A transient provider error leaves the
 * payout pending with a later next_attempt_at; once attempts are exhausted the
 * payout is marked failed and the contributor is notified.
 */
export async function runPayoutRetries(): Promise<JobResult> {
  const result: JobResult = { job: 'payout_retries', processed: 0, failed: 0 }
  if (!isStripeConfigured()) return result

  const now = new Date()
  const due = await payoutRepo.findDuePayouts(now.toISOString())
  const poolNames = new Map<string, string>()

  // LD-505: a transfer only moves once the contributor's balance clears the
  // threshold, so retries do not send amounts that cost more than they carry.
  const balances = new Map<string, number>()
  for (const payout of due) {
    balances.set(payout.user_id, (balances.get(payout.user_id) ?? 0) + payout.amount_cents)
  }

  for (const payout of due) {
    if ((balances.get(payout.user_id) ?? 0) < PAYOUT_THRESHOLD_CENTS) continue

    const account = await payoutRepo.findAccount(payout.user_id).catch(() => null)
    // Not onboarded yet: leave it pending and untouched so it flushes the moment
    // the connected account becomes able to receive transfers.
    if (!account || !account.payouts_enabled) continue

    const attempt = payout.attempts + 1
    try {
      const transfer = await getStripe().transfers.create({
        amount: payout.amount_cents,
        currency: 'usd',
        destination: account.stripe_account_id,
        metadata: { payoutId: payout.id, userId: payout.user_id },
      })
      await payoutRepo.updatePayout(payout.id, {
        status: 'paid',
        stripe_transfer_id: transfer.id,
        attempts: attempt,
        last_error: null,
        next_attempt_at: null,
        updated_at: now.toISOString(),
      })
      await createAuditEntry({
        userId: payout.user_id,
        eventType: 'payout_sent',
        action: `Received a payout of $${(payout.amount_cents / 100).toFixed(2)}`,
        actorType: 'system',
        metadata: { payout_id: payout.id, amount_cents: payout.amount_cents, attempt },
      })
      await notifyPayoutPaid(payout.user_id, {
        poolName: await poolNameFor(payout.pool_id, poolNames),
        amountCents: payout.amount_cents,
        payoutId: payout.id,
      })
      result.processed += 1
    } catch (error) {
      const exhausted = attempt >= MAX_PAYOUT_ATTEMPTS
      const message = error instanceof Error ? error.message : 'Transfer failed'
      await payoutRepo
        .updatePayout(payout.id, {
          status: exhausted ? 'failed' : 'pending',
          attempts: attempt,
          last_error: message.slice(0, 500),
          next_attempt_at: exhausted
            ? null
            : new Date(now.getTime() + backoffMsForAttempt(attempt)).toISOString(),
          updated_at: now.toISOString(),
        })
        .catch(() => undefined)

      if (exhausted) {
        errorLogger.log(error, ErrorSeverity.HIGH, {
          userId: payout.user_id,
          action: 'PAYOUT_RETRIES_EXHAUSTED',
          resource: 'payout',
          metadata: { payoutId: payout.id, attempts: attempt },
        })
        await createAuditEntry({
          userId: payout.user_id,
          eventType: 'payout_failed',
          action: `Payout of $${(payout.amount_cents / 100).toFixed(2)} could not be sent after ${attempt} attempts`,
          actorType: 'system',
          success: false,
          metadata: { payout_id: payout.id, amount_cents: payout.amount_cents },
        }).catch(() => undefined)
        await notifyPayoutFailed(payout.user_id, {
          poolName: await poolNameFor(payout.pool_id, poolNames),
          amountCents: payout.amount_cents,
          payoutId: payout.id,
        })
      }
      result.failed += 1
    }
  }

  return result
}

/**
 * Mark consent grants whose end date has passed. Access checks already reject an
 * out-of-window grant; this records the expiry as an explicit, auditable event so
 * the user can see when a grant lapsed.
 */
export async function runConsentExpiry(): Promise<JobResult> {
  const result: JobResult = { job: 'consent_expiry', processed: 0, failed: 0 }
  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data, error } = await service
    .from('consents')
    .update({ expired_at: now })
    .is('expired_at', null)
    .eq('revoked', false)
    .not('end_date', 'is', null)
    .lt('end_date', now)
    .select('id, user_id, granted_to, granted_to_name')
  if (error) throw error

  for (const consent of data ?? []) {
    await createAuditEntry({
      userId: consent.user_id,
      eventType: 'consent_expired',
      action: `Consent for ${consent.granted_to_name ?? consent.granted_to} reached its end date`,
      consentId: consent.id,
      actorType: 'system',
    }).catch(() => {
      result.failed += 1
    })
    result.processed += 1
  }

  return result
}

/** Mark credential share tokens whose window has closed. */
export async function runShareExpiry(): Promise<JobResult> {
  const result: JobResult = { job: 'share_expiry', processed: 0, failed: 0 }
  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data, error } = await service
    .from('credential_shares')
    .update({ expired_at: now })
    .is('expired_at', null)
    .eq('revoked', false)
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .select('id')
  if (error) throw error

  result.processed = (data ?? []).length
  return result
}

/** Drop rate-limit counters from windows that can no longer be consulted. */
export async function runRateLimitPurge(): Promise<JobResult> {
  const processed = await purgeExpiredRateLimits()
  return { job: 'rate_limit_purge', processed, failed: 0 }
}

/**
 * LD-607: destroy records past their stated retention window. Turns pool
 * retention_days and export windows from claims into enforced rules.
 */
export async function runRetentionPurge(): Promise<JobResult> {
  const { results, failed } = await runRetentionPurges()
  const processed = results.reduce((total, entry) => total + entry.deleted, 0)
  return { job: 'retention_purge', processed, failed }
}

const JOB_RUNNERS: Record<JobName, () => Promise<JobResult>> = {
  payout_retries: runPayoutRetries,
  consent_expiry: runConsentExpiry,
  share_expiry: runShareExpiry,
  rate_limit_purge: runRateLimitPurge,
  retention_purge: runRetentionPurge,
}

async function recordRun(result: JobResult, startedAt: string): Promise<void> {
  const service = createServiceClient()
  await service
    .from('job_runs')
    .insert({
      job: result.job,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      processed: result.processed,
      failed: result.failed,
      error: result.error ?? null,
    })
    .then(undefined, () => undefined)
}

/**
 * Run one job, or every job when no name is given. A job that throws is caught
 * and reported so one broken job cannot stop the rest of the sweep.
 */
export async function runScheduledJobs(only?: JobName): Promise<JobResult[]> {
  const names = only ? [only] : [...JOB_NAMES]
  const results: JobResult[] = []

  for (const name of names) {
    const startedAt = new Date().toISOString()
    let result: JobResult
    try {
      result = await JOB_RUNNERS[name]()
    } catch (error) {
      errorLogger.log(error, ErrorSeverity.HIGH, {
        action: 'SCHEDULED_JOB_FAILED',
        resource: name,
      })
      result = {
        job: name,
        processed: 0,
        failed: 0,
        error: error instanceof Error ? error.message : 'Job failed',
      }
    }
    await recordRun(result, startedAt)
    results.push(result)
  }

  return results
}

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value)
}
