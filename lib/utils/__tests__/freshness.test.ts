import { describe, it, expect } from 'vitest'
import {
  deriveSourceHealth,
  formatCoverage,
  formatFreshness,
  STALE_AFTER_MS,
} from '@/lib/utils/freshness'

const NOW = new Date('2026-07-26T12:00:00.000Z').getTime()
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString()
}

describe('formatFreshness', () => {
  it('reports never when a source has not synced', () => {
    expect(formatFreshness(null, NOW)).toBe('Never')
  })

  it('reports never rather than NaN for an unparseable timestamp', () => {
    expect(formatFreshness('not a date', NOW)).toBe('Never')
  })

  it('collapses the last minute to just now', () => {
    expect(formatFreshness(ago(5000), NOW)).toBe('Just now')
  })

  it('does not report the future as stale', () => {
    expect(formatFreshness(new Date(NOW + HOUR).toISOString(), NOW)).toBe('Just now')
  })

  it('singularizes one unit', () => {
    expect(formatFreshness(ago(MINUTE), NOW)).toBe('1 minute ago')
    expect(formatFreshness(ago(HOUR), NOW)).toBe('1 hour ago')
    expect(formatFreshness(ago(DAY), NOW)).toBe('1 day ago')
  })

  it('pluralizes the rest', () => {
    expect(formatFreshness(ago(5 * MINUTE), NOW)).toBe('5 minutes ago')
    expect(formatFreshness(ago(3 * HOUR), NOW)).toBe('3 hours ago')
    expect(formatFreshness(ago(6 * DAY), NOW)).toBe('6 days ago')
  })

  it('rounds down, so 100 minutes is an hour and not two', () => {
    expect(formatFreshness(ago(100 * MINUTE), NOW)).toBe('1 hour ago')
  })

  it('falls back to a date beyond a month, where relative time stops helping', () => {
    const old = ago(120 * DAY)
    expect(formatFreshness(old, NOW)).toBe(new Date(old).toLocaleDateString())
  })
})

describe('deriveSourceHealth', () => {
  it('calls a source that has never synced pending, not broken', () => {
    expect(deriveSourceHealth('connected', null, NOW)).toBe('pending')
  })

  it('calls a recent sync healthy', () => {
    expect(deriveSourceHealth('connected', ago(HOUR), NOW)).toBe('healthy')
  })

  it('calls a connected source that stopped sending stale', () => {
    expect(deriveSourceHealth('connected', ago(STALE_AFTER_MS + MINUTE), NOW)).toBe('stale')
  })

  it('treats the boundary itself as still healthy', () => {
    expect(deriveSourceHealth('connected', ago(STALE_AFTER_MS), NOW)).toBe('healthy')
  })

  it('calls an errored source broken regardless of when it last synced', () => {
    expect(deriveSourceHealth('error', ago(MINUTE), NOW)).toBe('error')
  })

  it('treats a disconnected source as needing attention', () => {
    expect(deriveSourceHealth('disconnected', ago(MINUTE), NOW)).toBe('error')
  })

  it('does not claim health from an unparseable timestamp', () => {
    expect(deriveSourceHealth('connected', 'not a date', NOW)).toBe('pending')
  })
})

describe('formatCoverage', () => {
  it('returns nothing when there is nothing imported', () => {
    expect(formatCoverage(null, null)).toBeNull()
    expect(formatCoverage('2026-01-01T00:00:00.000Z', null)).toBeNull()
  })

  it('collapses a single day to one date', () => {
    const day = '2026-07-26T08:00:00.000Z'
    expect(formatCoverage(day, '2026-07-26T20:00:00.000Z')).toBe(
      new Date(day).toLocaleDateString()
    )
  })

  it('reports a range across days', () => {
    const from = '2026-01-02T00:00:00.000Z'
    const to = '2026-07-26T00:00:00.000Z'
    expect(formatCoverage(from, to)).toBe(
      `${new Date(from).toLocaleDateString()} to ${new Date(to).toLocaleDateString()}`
    )
  })

  it('returns nothing for an unparseable range rather than printing Invalid Date', () => {
    expect(formatCoverage('nope', '2026-07-26T00:00:00.000Z')).toBeNull()
  })
})
