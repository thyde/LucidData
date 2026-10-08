/**
 * LD-610 measures of success.
 *
 * Every measure in section 6 of the roadmap that first-party data can answer is
 * computed by the `product_metrics` database function, in aggregate, from rows
 * the product already keeps. Nothing goes to a third party.
 *
 * Weekly snapshots are kept because some source rows are purged on a schedule,
 * so history would otherwise shrink. A week's snapshot is rewritten once a day
 * for six weeks, which is long enough for its thirty-day measures to mature for
 * someone who signed up on its last day, and is then left alone.
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { Json } from '@/types/database.types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Weeks kept current. Six covers thirty days of maturity after a week ends. */
export const SNAPSHOT_WEEKS = 6

/** How often the snapshots are rewritten. The scheduler runs hourly. */
export const SNAPSHOT_INTERVAL_MS = DAY_MS

export interface MetricsPeriod {
  from: Date
  to: Date
}

/** The most recent complete Monday-to-Monday week in UTC before `now`. */
export function lastCompleteWeek(now: Date): MetricsPeriod {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7
  const to = new Date(midnight - daysSinceMonday * DAY_MS)
  return { from: new Date(to.getTime() - WEEK_MS), to }
}

/** The last `count` complete weeks, newest first. */
export function completeWeeks(now: Date, count: number): MetricsPeriod[] {
  const newest = lastCompleteWeek(now)
  return Array.from({ length: count }, (_, index) => ({
    from: new Date(newest.from.getTime() - index * WEEK_MS),
    to: new Date(newest.to.getTime() - index * WEEK_MS),
  }))
}

export async function getProductMetrics(period: MetricsPeriod): Promise<Json> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('product_metrics', {
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  })
  if (error) throw error
  return data
}

/**
 * Rewrite the snapshots for the last six complete weeks, at most once a day.
 * Returns how many weeks were written, which is zero when the newest snapshot
 * is still fresh, so the hourly scheduler can call this freely.
 */
export async function refreshMetricSnapshots(now: Date = new Date()): Promise<number> {
  const weeks = completeWeeks(now, SNAPSHOT_WEEKS)
  const service = createServiceClient()

  const { data: newest, error: readError } = await service
    .from('metric_snapshots')
    .select('refreshed_at')
    .eq('period_start', weeks[0].from.toISOString())
    .eq('period_end', weeks[0].to.toISOString())
    .maybeSingle()
  if (readError) throw readError
  if (newest && now.getTime() - new Date(newest.refreshed_at).getTime() < SNAPSHOT_INTERVAL_MS) {
    return 0
  }

  for (const week of weeks) {
    const metrics = await getProductMetrics(week)
    const { error } = await service.from('metric_snapshots').upsert(
      {
        period_start: week.from.toISOString(),
        period_end: week.to.toISOString(),
        metrics,
        refreshed_at: now.toISOString(),
      },
      { onConflict: 'period_start,period_end' }
    )
    if (error) throw error
  }

  return weeks.length
}
