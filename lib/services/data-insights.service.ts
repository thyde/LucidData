import { createServiceClient } from '@/lib/supabase/service'
import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as monetizationRepo from '@/lib/repositories/monetization.repository'
import { findVaultByUserId } from '@/lib/repositories/vault.repository'

/** Categories used to gauge profile completeness for the data score. */
const SCORE_CATEGORIES = ['personal', 'health', 'financial', 'credentials', 'other']

export interface DataScore {
  score: number
  completeness: number
  categoriesCovered: number
  totalCategories: number
  vaultEntries: number
  optedInFields: number
}

export interface TrackerPoint {
  date: string
  shared: number
  bought: number
}

export interface CategoryCount {
  category: string
  count: number
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Profile completeness + monetization readiness, MyData-style "data score". */
export async function getDataScore(userId: string): Promise<DataScore> {
  const [vault, fields] = await Promise.all([
    findVaultByUserId(userId),
    monetizationRepo.findFieldsByUser(userId),
  ])
  const covered = new Set(vault.map((v) => v.category))
  const categoriesCovered = SCORE_CATEGORIES.filter((c) => covered.has(c)).length
  const optedInFields = fields.filter((f) => f.opted_in).length
  const completeness = Math.round((categoriesCovered / SCORE_CATEGORIES.length) * 100)
  // Score blends category coverage with how much the user has opted into selling.
  const monetizationBonus = Math.min(optedInFields * 4, 40)
  const score = Math.min(completeness + monetizationBonus, 100)
  return {
    score,
    completeness,
    categoriesCovered,
    totalCategories: SCORE_CATEGORIES.length,
    vaultEntries: vault.length,
    optedInFields,
  }
}

/**
 * Time series of your data shared (contributions) vs buyer accesses (orders against
 * pools you contributed to), for the trailing `days`.
 */
export async function getDataTracker(userId: string, days = 14): Promise<TrackerPoint[]> {
  const contributions = await contributionRepo.findContributionsByUser(userId)

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - (days - 1))
  since.setUTCHours(0, 0, 0, 0)

  const sharedByDay = new Map<string, number>()
  const poolIds = new Set<string>()
  for (const c of contributions) {
    poolIds.add(c.pool_id)
    const created = new Date(c.created_at)
    if (created >= since) sharedByDay.set(dayKey(created), (sharedByDay.get(dayKey(created)) ?? 0) + 1)
  }

  // Buyer accesses: orders against pools this user contributed to.
  const boughtByDay = new Map<string, number>()
  if (poolIds.size > 0) {
    const service = createServiceClient()
    const { data, error } = await service
      .from('data_orders')
      .select('created_at, pool_id')
      .in('pool_id', Array.from(poolIds))
      .gte('created_at', since.toISOString())
    if (error) throw error
    for (const o of data ?? []) {
      const k = dayKey(new Date(o.created_at))
      boughtByDay.set(k, (boughtByDay.get(k) ?? 0) + 1)
    }
  }

  const points: TrackerPoint[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setUTCDate(since.getUTCDate() + i)
    const k = dayKey(d)
    points.push({ date: k, shared: sharedByDay.get(k) ?? 0, bought: boughtByDay.get(k) ?? 0 })
  }
  return points
}

/** Data points by category — "Data Market" donut. */
export async function getDataMarket(userId: string): Promise<CategoryCount[]> {
  const [fields, vault] = await Promise.all([
    monetizationRepo.findFieldsByUser(userId),
    findVaultByUserId(userId),
  ])
  const map = new Map<string, number>()
  const optedIn = fields.filter((f) => f.opted_in)
  if (optedIn.length > 0) {
    for (const f of optedIn) map.set(f.category, (map.get(f.category) ?? 0) + 1)
  } else {
    // Fall back to vault entries by category so the chart is meaningful pre-opt-in.
    for (const v of vault) map.set(v.category, (map.get(v.category) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}
