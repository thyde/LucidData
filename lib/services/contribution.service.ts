import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as monetizationRepo from '@/lib/repositories/monetization.repository'
import * as payoutRepo from '@/lib/repositories/payout.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertNotUniversallyOptedOut } from '@/lib/services/privacy-signal.service'
import type { PoolContribution, Json } from '@/types/database.types'
import type { ContributeInput } from '@/lib/validations/marketplace'
import { isMarketplaceCategoryAllowed } from '@/lib/validations/marketplace'
import { containsIdentifierField } from '@/lib/crypto/anonymize'
import { PLATFORM_FEE_BPS, splitEarnings } from '@/lib/constants/marketplace-economics'
import {
  assertContributionVelocity,
  DuplicateContributionError,
  isDuplicateContribution,
} from '@/lib/services/marketplace-integrity.service'

export interface EarningsSummary {
  totalCents: number
  earnedThisMonthCents: number
  activeContributions: number
  byCategory: { category: string; cents: number }[]
}

export async function listMyContributions(userId: string): Promise<PoolContribution[]> {
  return contributionRepo.findContributionsByUser(userId)
}

/**
 * Contribute one vault entry's browser-anonymized fields to an open pool. Payout
 * accrues per record at the pool's per-record price (stubbed; no real money moves).
 */
export async function contribute(userId: string, input: ContributeInput): Promise<PoolContribution> {
  // LD-302: a universal opt-out signal means no sale or sharing, checked before
  // anything else so an opted-out user never reaches the contribution path.
  await assertNotUniversallyOptedOut(userId)

  const pool = await poolRepo.findOpenPoolById(input.pool_id)
  if (!pool) throw new Error('Pool not found or no longer open')
  if (!isMarketplaceCategoryAllowed(pool.category as ContributeInput['category'])) {
    throw new Error('This category is not available for marketplace sale')
  }

  const preferences = await monetizationRepo.findSalePreferences(userId)
  if (preferences && pool.price_per_record_cents < preferences.min_price_cents) {
    throw new Error('This pool pays less than your minimum price per record')
  }
  if (preferences?.blocked_buyer_orgs.includes(pool.buyer_org_id)) {
    throw new Error('You have blocked this buyer organization')
  }
  if (
    preferences &&
    preferences.allowed_purposes.length > 0 &&
    !preferences.allowed_purposes.includes(pool.purpose)
  ) {
    throw new Error('This pool purpose is not in your allowed purposes')
  }

  if (containsIdentifierField(input.anonymized_payload)) {
    throw new Error('The contribution contains a direct identifier')
  }

  // LD-506: refuse a rate no person contributes at. Checked before the payload
  // work below so a flood costs as little as possible.
  await assertContributionVelocity(userId, input.pool_id)

  const fieldSettings = await monetizationRepo.findFieldsByVault(
    input.vault_data_id,
    userId
  )
  const optedInFields = new Set(
    fieldSettings.filter((field) => field.opted_in).map((field) => field.field_key)
  )
  const privateFields = Object.keys(input.anonymized_payload).filter(
    (field) => !optedInFields.has(field)
  )
  if (privateFields.length > 0) {
    throw new Error(`These fields are private: ${privateFields.join(', ')}`)
  }

  // LD-501: the privacy gate classifies fields per schema, not per broad data
  // category, so the schema has to travel with the contribution. A vault entry
  // the user does not own resolves to null, which the gate treats as
  // unclassifiable and suppresses.
  const vaultEntry = await vaultRepo.findVaultById(input.vault_data_id, userId)

  // LD-506: the unique index is the actual control. This only turns its error
  // into something the person can act on, so a caller that forgets to check
  // still cannot write a duplicate.
  let contribution: PoolContribution
  try {
    contribution = await contributionRepo.createContribution({
      pool_id: input.pool_id,
      user_id: userId,
      vault_data_id: input.vault_data_id,
      anonymized_payload: input.anonymized_payload as Json,
      category: input.category,
      schema_type: vaultEntry?.schema_type ?? null,
      payout_cents: pool.price_per_record_cents,
      // LD-505: pin the fee that applied when the person agreed. A later change to
      // the platform fee must never alter terms already consented to.
      platform_fee_bps: PLATFORM_FEE_BPS,
      declared_purpose: pool.purpose,
      consent_version: '2026-07-25',
      consented_at: new Date().toISOString(),
    })
  } catch (error) {
    if (isDuplicateContribution(error)) throw new DuplicateContributionError()
    throw error
  }

  const split = splitEarnings(pool.price_per_record_cents, PLATFORM_FEE_BPS)
  await createAuditEntry({
    userId,
    eventType: 'data_contributed',
    action: `Shared ${Object.keys(input.anonymized_payload).length} field(s) to pool "${pool.name}"`,
    vaultDataId: input.vault_data_id,
    metadata: {
      pool_id: input.pool_id,
      buyer_org_id: pool.buyer_org_id,
      purpose: pool.purpose,
      gross_cents: split.grossCents,
      platform_fee_cents: split.platformFeeCents,
      payout_cents: split.netCents,
      platform_fee_bps: PLATFORM_FEE_BPS,
      consent_version: '2026-07-25',
    },
  })
  return contribution
}

export async function withdraw(id: string, userId: string): Promise<PoolContribution> {
  const contribution = await contributionRepo.withdrawContribution(id, userId)
  await createAuditEntry({
    userId,
    eventType: 'contribution_withdrawn',
    action: 'Withdrew a data contribution',
    metadata: { contribution_id: id },
  })
  return contribution
}

export async function getEarnings(userId: string): Promise<EarningsSummary> {
  const [contributions, payouts] = await Promise.all([
    contributionRepo.findContributionsByUser(userId),
    payoutRepo.findPayoutsByUser(userId),
  ])
  const active = contributions.filter((c) => c.status === 'active')
  const contributionCategories = new Map(contributions.map((c) => [c.id, c.category]))

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const byCategoryMap = new Map<string, number>()
  let totalCents = 0
  let earnedThisMonthCents = 0
  for (const payout of payouts) {
    if (payout.status !== 'paid') continue
    totalCents += payout.amount_cents
    const category = payout.contribution_id
      ? contributionCategories.get(payout.contribution_id) ?? 'other'
      : 'other'
    byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + payout.amount_cents)
    if (new Date(payout.created_at) >= startOfMonth) {
      earnedThisMonthCents += payout.amount_cents
    }
  }

  return {
    totalCents,
    earnedThisMonthCents,
    activeContributions: active.length,
    byCategory: Array.from(byCategoryMap.entries()).map(([category, cents]) => ({ category, cents })),
  }
}
