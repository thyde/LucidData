/**
 * LD-202 sync freshness.
 *
 * A connector that silently stopped working is worse than no connector, because
 * the vault still looks populated while the numbers quietly go stale. So a
 * source has four states, not two, and "connected but hasn't synced in a week"
 * is one of them.
 */

/** Beyond this, a connected source is stale even though nothing errored. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export type SourceHealth = 'healthy' | 'stale' | 'error' | 'pending'

export function deriveSourceHealth(
  status: string,
  lastSyncedAt: string | null,
  now: number = Date.now()
): SourceHealth {
  if (status === 'error' || status === 'disconnected') return 'error'
  if (!lastSyncedAt) return 'pending'
  const age = now - new Date(lastSyncedAt).getTime()
  if (Number.isNaN(age)) return 'pending'
  return age > STALE_AFTER_MS ? 'stale' : 'healthy'
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/**
 * Relative time for a sync timestamp.
 *
 * Rounds down rather than to nearest, because a source last synced 100 minutes
 * ago should read "1 hour ago" and not "2 hours ago". Overstating freshness is
 * the failure that matters here.
 */
export function formatFreshness(
  timestamp: string | null,
  now: number = Date.now()
): string {
  if (!timestamp) return 'Never'
  const then = new Date(timestamp).getTime()
  if (Number.isNaN(then)) return 'Never'

  const age = now - then
  if (age < 0) return 'Just now'
  if (age < MINUTE) return 'Just now'
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute')
  if (age < DAY) return plural(Math.floor(age / HOUR), 'hour')
  if (age < 30 * DAY) return plural(Math.floor(age / DAY), 'day')
  return new Date(timestamp).toLocaleDateString()
}

/**
 * The span an import actually covers, which is not the same as when it ran.
 * A backfill that reaches back six months and a sync that only has yesterday
 * look identical on "last synced".
 */
export function formatCoverage(
  first: string | null,
  last: string | null
): string | null {
  if (!first || !last) return null
  const from = new Date(first)
  const to = new Date(last)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  const fromLabel = from.toLocaleDateString()
  const toLabel = to.toLocaleDateString()
  return fromLabel === toLabel ? fromLabel : `${fromLabel} to ${toLabel}`
}
