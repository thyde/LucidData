import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.fn()
const upsert = vi.fn()
const maybeSingle = vi.fn()
const eqCalls: [string, unknown][] = []

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          eqCalls.push([column, value])
          return query
        },
        maybeSingle: () => maybeSingle(table),
        upsert: (row: unknown, options: unknown) => upsert(table, row, options),
      }
      return query
    },
  }),
}))

const {
  SNAPSHOT_WEEKS,
  completeWeeks,
  getProductMetrics,
  lastCompleteWeek,
  refreshMetricSnapshots,
} = await import('@/lib/services/product-metrics.service')

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { signups: 3 }, error: null })
  upsert.mockReset().mockResolvedValue({ error: null })
  maybeSingle.mockReset().mockResolvedValue({ data: null, error: null })
  eqCalls.length = 0
})

describe('lastCompleteWeek', () => {
  it('ends at the most recent Monday midnight UTC', () => {
    // Wednesday 2026-10-07 15:00 UTC.
    const week = lastCompleteWeek(new Date('2026-10-07T15:00:00Z'))
    expect(week.from.toISOString()).toBe('2026-09-28T00:00:00.000Z')
    expect(week.to.toISOString()).toBe('2026-10-05T00:00:00.000Z')
  })

  it('treats a Monday as the end of the week just finished', () => {
    const week = lastCompleteWeek(new Date('2026-10-05T00:30:00Z'))
    expect(week.from.toISOString()).toBe('2026-09-28T00:00:00.000Z')
    expect(week.to.toISOString()).toBe('2026-10-05T00:00:00.000Z')
  })

  it('handles a Sunday late in the day', () => {
    const week = lastCompleteWeek(new Date('2026-10-04T23:59:00Z'))
    expect(week.from.toISOString()).toBe('2026-09-21T00:00:00.000Z')
    expect(week.to.toISOString()).toBe('2026-09-28T00:00:00.000Z')
  })
})

describe('completeWeeks', () => {
  it('returns adjacent weeks, newest first', () => {
    const weeks = completeWeeks(new Date('2026-10-07T15:00:00Z'), 3)
    expect(weeks.map((week) => week.from.toISOString())).toEqual([
      '2026-09-28T00:00:00.000Z',
      '2026-09-21T00:00:00.000Z',
      '2026-09-14T00:00:00.000Z',
    ])
    for (let index = 1; index < weeks.length; index += 1) {
      expect(weeks[index].to.getTime()).toBe(weeks[index - 1].from.getTime())
    }
  })

  it('reaches back far enough for thirty-day measures to mature', () => {
    const now = new Date('2026-10-07T15:00:00Z')
    const oldest = completeWeeks(now, SNAPSHOT_WEEKS).at(-1)!
    // Someone who signed up at the very end of the oldest week has had thirty
    // days by the time the newest week closes.
    const thirtyDaysAfterOldest = oldest.to.getTime() + 30 * 24 * 60 * 60 * 1000
    expect(thirtyDaysAfterOldest).toBeLessThanOrEqual(lastCompleteWeek(now).to.getTime())
  })
})

describe('getProductMetrics', () => {
  it('passes the period to the database function', async () => {
    const result = await getProductMetrics({
      from: new Date('2026-09-28T00:00:00Z'),
      to: new Date('2026-10-05T00:00:00Z'),
    })
    expect(rpc).toHaveBeenCalledWith('product_metrics', {
      p_from: '2026-09-28T00:00:00.000Z',
      p_to: '2026-10-05T00:00:00.000Z',
    })
    expect(result).toEqual({ signups: 3 })
  })

  it('surfaces a database error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(getProductMetrics({ from: new Date(0), to: new Date(1) })).rejects.toThrow(
      'permission denied'
    )
  })
})

describe('refreshMetricSnapshots', () => {
  const now = new Date('2026-10-07T15:00:00Z')

  it('writes one row per week, keyed so a rerun replaces it', async () => {
    const written = await refreshMetricSnapshots(now)
    expect(written).toBe(SNAPSHOT_WEEKS)
    expect(rpc).toHaveBeenCalledTimes(SNAPSHOT_WEEKS)
    expect(upsert).toHaveBeenCalledWith(
      'metric_snapshots',
      {
        period_start: '2026-09-28T00:00:00.000Z',
        period_end: '2026-10-05T00:00:00.000Z',
        metrics: { signups: 3 },
        refreshed_at: now.toISOString(),
      },
      { onConflict: 'period_start,period_end' }
    )
  })

  it('checks freshness against the newest week', async () => {
    await refreshMetricSnapshots(now)
    expect(eqCalls).toEqual([
      ['period_start', '2026-09-28T00:00:00.000Z'],
      ['period_end', '2026-10-05T00:00:00.000Z'],
    ])
  })

  it('does nothing when the newest snapshot is less than a day old', async () => {
    maybeSingle.mockResolvedValue({
      data: { refreshed_at: '2026-10-07T03:00:00Z' },
      error: null,
    })
    expect(await refreshMetricSnapshots(now)).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('rewrites the snapshots once a day has passed', async () => {
    maybeSingle.mockResolvedValue({
      data: { refreshed_at: '2026-10-06T14:00:00Z' },
      error: null,
    })
    expect(await refreshMetricSnapshots(now)).toBe(SNAPSHOT_WEEKS)
  })

  it('stops at the first failed write rather than reporting success', async () => {
    upsert.mockResolvedValueOnce({ error: new Error('disk full') })
    await expect(refreshMetricSnapshots(now)).rejects.toThrow('disk full')
  })
})
