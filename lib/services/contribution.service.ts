import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { PoolContribution, Json } from '@/types/database.types'
import type { ContributeInput } from '@/lib/validations/marketplace'

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
  const pool = await poolRepo.findOpenPoolById(input.pool_id)
  if (!pool) throw new Error('Pool not found or no longer open')

  const contribution = await contributionRepo.createContribution({
    pool_id: input.pool_id,
    user_id: userId,
    vault_data_id: input.vault_data_id ?? null,
    anonymized_payload: input.anonymized_payload as Json,
    category: input.category,
    payout_cents: pool.price_per_record_cents,
  })

  await createAuditEntry({
    userId,
    eventType: 'data_contributed',
    action: `Shared ${Object.keys(input.anonymized_payload).length} field(s) to pool "${pool.name}"`,
    vaultDataId: input.vault_data_id,
    metadata: { pool_id: input.pool_id, payout_cents: pool.price_per_record_cents },
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
  const contributions = await contributionRepo.findContributionsByUser(userId)
  const active = contributions.filter((c) => c.status === 'active')

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const byCategoryMap = new Map<string, number>()
  let totalCents = 0
  let earnedThisMonthCents = 0
  for (const c of active) {
    totalCents += c.payout_cents
    byCategoryMap.set(c.category, (byCategoryMap.get(c.category) ?? 0) + c.payout_cents)
    if (new Date(c.created_at) >= startOfMonth) earnedThisMonthCents += c.payout_cents
  }

  return {
    totalCents,
    earnedThisMonthCents,
    activeContributions: active.length,
    byCategory: Array.from(byCategoryMap.entries()).map(([category, cents]) => ({ category, cents })),
  }
}
