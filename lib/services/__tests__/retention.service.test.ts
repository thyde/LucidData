import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-607: one test per retention category, because "retention is enforced" is
 * only true if each clock actually fires.
 */

interface Call {
  table: string
  op: 'delete' | 'select'
  filters: [string, string, unknown][]
}

const calls: Call[] = []
const results = new Map<string, unknown[]>()

function chainFor(table: string, op: 'delete' | 'select') {
  const call: Call = { table, op, filters: [] }
  calls.push(call)
  const chain = {
    eq(column: string, value: unknown) {
      call.filters.push(['eq', column, value])
      return chain
    },
    is(column: string, value: unknown) {
      call.filters.push(['is', column, value])
      return chain
    },
    lt(column: string, value: unknown) {
      call.filters.push(['lt', column, value])
      return chain
    },
    in(column: string, value: unknown) {
      call.filters.push(['in', column, value])
      return chain
    },
    select() {
      return Promise.resolve({ data: results.get(`${table}:${op}`) ?? [], error: null })
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve({
        data: results.get(`${table}:${op}`) ?? [],
        error: null,
      }).then(resolve)
    },
  }
  return chain
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      delete: () => chainFor(table, 'delete'),
      select: () =>
        Promise.resolve({ data: results.get(`${table}:select`) ?? [], error: null }),
    }),
  }),
}))

const {
  purgeExpiredConsentRequests,
  purgeExpiredCredentialRequests,
  purgeExpiredShares,
  purgeOldNotifications,
  enforceExportRetention,
  runRetentionPurges,
} = await import('@/lib/services/retention.service')

const {
  CONSENT_REQUEST_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  SHARE_RETENTION_DAYS,
  DAY_MS,
} = await import('@/lib/constants/retention')

const NOW = new Date('2026-07-26T00:00:00.000Z')

beforeEach(() => {
  calls.length = 0
  results.clear()
})

function filtersFor(table: string): [string, string, unknown][][] {
  return calls.filter((call) => call.table === table).map((call) => call.filters)
}

describe('purgeExpiredConsentRequests', () => {
  it('deletes answered requests past the window and lapsed ones separately', async () => {
    results.set('consent_requests:delete', [{ id: 'a' }])
    const result = await purgeExpiredConsentRequests(NOW)
    // Two passes: answered, then never-answered but expired.
    expect(result).toEqual({ category: 'consent_requests', deleted: 2 })
    expect(filtersFor('consent_requests')).toHaveLength(2)
  })

  it('measures the window from when the request stopped being live', async () => {
    await purgeExpiredConsentRequests(NOW)
    const cutoff = new Date(
      NOW.getTime() - CONSENT_REQUEST_RETENTION_DAYS * DAY_MS
    ).toISOString()
    expect(filtersFor('consent_requests')[0]).toContainEqual(['lt', 'responded_at', cutoff])
    expect(filtersFor('consent_requests')[1]).toContainEqual(['is', 'responded_at', null])
    expect(filtersFor('consent_requests')[1]).toContainEqual(['lt', 'expires_at', cutoff])
  })

  it('leaves a live request alone', async () => {
    await purgeExpiredConsentRequests(NOW)
    // Every pass is bounded by a cutoff; none deletes unconditionally.
    for (const filters of filtersFor('consent_requests')) {
      expect(filters.some(([op]) => op === 'lt')).toBe(true)
    }
  })
})

describe('purgeExpiredCredentialRequests', () => {
  it('applies the same two-pass rule', async () => {
    results.set('credential_requests:delete', [{ id: 'a' }, { id: 'b' }])
    const result = await purgeExpiredCredentialRequests(NOW)
    expect(result).toEqual({ category: 'credential_requests', deleted: 4 })
    expect(filtersFor('credential_requests')).toHaveLength(2)
  })
})

describe('purgeExpiredShares', () => {
  it('removes tokens that expired and tokens that were revoked', async () => {
    results.set('credential_shares:delete', [{ id: 'a' }])
    const result = await purgeExpiredShares(NOW)
    expect(result).toEqual({ category: 'credential_shares', deleted: 2 })

    const cutoff = new Date(NOW.getTime() - SHARE_RETENTION_DAYS * DAY_MS).toISOString()
    expect(filtersFor('credential_shares')[0]).toContainEqual(['lt', 'expired_at', cutoff])
    expect(filtersFor('credential_shares')[1]).toContainEqual(['eq', 'revoked', true])
  })
})

describe('purgeOldNotifications', () => {
  it('deletes by creation date', async () => {
    results.set('notifications:delete', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const result = await purgeOldNotifications(NOW)
    expect(result).toEqual({ category: 'notifications', deleted: 3 })

    const cutoff = new Date(
      NOW.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS
    ).toISOString()
    expect(filtersFor('notifications')[0]).toContainEqual(['lt', 'created_at', cutoff])
  })
})

describe('enforceExportRetention', () => {
  const order = (overrides: Record<string, unknown>) => ({
    id: 'order-1',
    created_at: NOW.toISOString(),
    export_expires_at: new Date(NOW.getTime() + 7 * DAY_MS).toISOString(),
    data_pools: { retention_days: 30 },
    ...overrides,
  })

  it('leaves a live order untouched', async () => {
    results.set('data_orders:select', [order({})])
    const result = await enforceExportRetention(NOW)
    expect(result).toEqual({ category: 'data_order_records', deleted: 0 })
    expect(filtersFor('data_order_records')).toHaveLength(0)
  })

  it('destroys records once the export window closes', async () => {
    results.set('data_orders:select', [
      order({ export_expires_at: new Date(NOW.getTime() - 3 * DAY_MS).toISOString() }),
    ])
    results.set('data_order_records:delete', [{ id: 'r1' }, { id: 'r2' }])
    const result = await enforceExportRetention(NOW)
    expect(result.deleted).toBe(2)
    expect(filtersFor('data_order_records')[0]).toContainEqual(['in', 'order_id', ['order-1']])
  })

  it('enforces pool retention_days even while the export window is open', async () => {
    // Bought 60 days ago under a 30-day retention promise, with a long export window.
    results.set('data_orders:select', [
      order({
        created_at: new Date(NOW.getTime() - 60 * DAY_MS).toISOString(),
        export_expires_at: new Date(NOW.getTime() + 365 * DAY_MS).toISOString(),
        data_pools: { retention_days: 30 },
      }),
    ])
    results.set('data_order_records:delete', [{ id: 'r1' }])
    const result = await enforceExportRetention(NOW)
    expect(result.deleted).toBe(1)
  })

  it('keeps records when retention_days has not elapsed', async () => {
    results.set('data_orders:select', [
      order({
        created_at: new Date(NOW.getTime() - 5 * DAY_MS).toISOString(),
        data_pools: { retention_days: 30 },
      }),
    ])
    const result = await enforceExportRetention(NOW)
    expect(result.deleted).toBe(0)
  })
})

describe('runRetentionPurges', () => {
  it('runs every category and totals them', async () => {
    results.set('data_orders:select', [])
    const { results: categories, failed } = await runRetentionPurges(NOW)
    expect(categories.map((entry) => entry.category)).toEqual([
      'consent_requests',
      'credential_requests',
      'credential_shares',
      'notifications',
      'data_order_records',
    ])
    expect(failed).toBe(0)
  })
})
