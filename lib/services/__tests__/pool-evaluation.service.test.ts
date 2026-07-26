import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-503: the evaluation surface must agree with the purchase path, because a
 * quote that disagrees with a charge is worse than no quote. It calls the same
 * `prepareRelease`, and it must never return a contributed value.
 */

const rpcCalls: { name: string; args: unknown }[] = []
const rpcResults = new Map<string, unknown[]>()
const findPoolByOrg = vi.fn()
const findActiveContributionsByPool = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({ data: rpcResults.get(name) ?? [], error: null })
    },
  }),
}))

vi.mock('@/lib/repositories/pool.repository', () => ({
  findPoolByOrg: (...a: unknown[]) => findPoolByOrg(...a),
}))

vi.mock('@/lib/repositories/contribution.repository', () => ({
  findActiveContributionsByPool: (...a: unknown[]) => findActiveContributionsByPool(...a),
}))

const { evaluatePool, contributorBand } = await import(
  '@/lib/services/pool-evaluation.service'
)

const POOL = {
  id: 'pool-1',
  name: 'Synthetic employment',
  description: 'For evaluation',
  category: 'credentials',
  purpose: 'research',
  retention_days: 30,
  minimum_contributors: 5,
  k_anonymity_target: 5,
  price_cents: 1000,
  price_per_record_cents: 200,
}

function contribution(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `c-${index}`,
    user_id: `u-${index}`,
    pool_id: 'pool-1',
    schema_type: 'employment',
    category: 'credentials',
    anonymized_payload: {
      employer: 'Synthetic Industries',
      role: 'Engineer',
      salary_range: '60k-100k',
    },
    payout_cents: 200,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  rpcCalls.length = 0
  rpcResults.clear()
  vi.clearAllMocks()
  findPoolByOrg.mockResolvedValue(POOL)
  findActiveContributionsByPool.mockResolvedValue(
    Array.from({ length: 6 }, (_, index) => contribution(index))
  )
})

describe('contributorBand', () => {
  it('bands rather than exposing an exact count', () => {
    // An exact count is a number a buyer could watch to infer when one person
    // joined or left.
    expect(contributorBand(0)).toBe('None yet')
    expect(contributorBand(4)).toBe('Under 10')
    expect(contributorBand(12)).toBe('10 to 49')
    expect(contributorBand(60)).toBe('50 to 99')
    expect(contributorBand(250)).toBe('100 to 499')
    expect(contributorBand(700)).toBe('500 to 999')
    expect(contributorBand(5000)).toBe('1,000 or more')
  })
})

describe('evaluatePool', () => {
  it('refuses a pool that is not the caller\u2019s', async () => {
    findPoolByOrg.mockResolvedValue(null)
    await expect(evaluatePool('pool-1', 'other-org')).rejects.toThrow('Pool not found')
  })

  it('reads coverage, freshness, and schema mix through aggregates only', async () => {
    await evaluatePool('pool-1', 'org-1')
    expect(rpcCalls.map((call) => call.name).sort()).toEqual([
      'pool_field_coverage',
      'pool_freshness',
      'pool_schema_mix',
    ])
    for (const call of rpcCalls) {
      expect(call.args).toEqual({ p_pool_id: 'pool-1' })
    }
  })

  it('reports the cohort size the purchase would actually achieve', async () => {
    const result = await evaluatePool('pool-1', 'org-1')
    expect(result.privacy.releasable).toBe(true)
    if (!result.privacy.releasable) throw new Error('expected releasable')
    expect(result.privacy.k).toBeGreaterThanOrEqual(5)
    expect(result.privacy.kTarget).toBe(5)
    expect(result.privacy.recordsOffered).toBe(6)
  })

  it('quotes on what would be delivered, not on what was contributed', async () => {
    // Three of the six are unique on every quasi-identifier, so the gate
    // suppresses them and the buyer must not be quoted for them.
    findActiveContributionsByPool.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, index) => contribution(index)),
      ...Array.from({ length: 2 }, (_, index) =>
        contribution(100 + index, {
          anonymized_payload: {
            employer: `Rare ${index}`,
            role: `Rare ${index}`,
            salary_range: '>150k',
          },
        })
      ),
    ])

    const result = await evaluatePool('pool-1', 'org-1')
    if (!result.privacy.releasable) throw new Error('expected releasable')
    const offered = result.privacy.recordsOffered
    expect(result.estimatedTotalCents).toBe(1000 + offered * 200)
  })

  it('says a refused pool is refused, without describing the cohort', async () => {
    findActiveContributionsByPool.mockResolvedValue([contribution(0), contribution(1)])
    const result = await evaluatePool('pool-1', 'org-1')
    expect(result.privacy.releasable).toBe(false)
    if (result.privacy.releasable) throw new Error('expected refusal')
    expect(result.privacy.reason.length).toBeGreaterThan(20)
    // No counts, so a buyer cannot binary-search the cohort size.
    expect(result.privacy.reason).not.toMatch(/\d/)
    expect(result.estimatedTotalCents).toBe(1000)
  })

  it('never returns a contributed value anywhere in the response', async () => {
    rpcResults.set('pool_field_coverage', [
      { field: 'employer', present: 6 },
      { field: 'salary_range', present: 6 },
    ])
    rpcResults.set('pool_schema_mix', [{ schema_type: 'employment', records: 6 }])

    const result = await evaluatePool('pool-1', 'org-1')
    const serialized = JSON.stringify(result)
    // The real contributions all say "Synthetic Industries". A preview that
    // echoed a contributed value would leak a small pool outright.
    expect(serialized).not.toContain('Synthetic Industries')
    expect(serialized).not.toContain('u-0')
    expect(serialized).not.toContain('c-0')
    // Field names are the schema, not the content, so those are expected.
    expect(serialized).toContain('employer')
  })

  it('computes coverage as a share of the records held', async () => {
    rpcResults.set('pool_field_coverage', [{ field: 'employer', present: 3 }])
    const result = await evaluatePool('pool-1', 'org-1')
    expect(result.coverage[0]).toEqual({ field: 'employer', present: 3, coverage: 0.5 })
  })

  it('orders freshness buckets from newest to oldest', async () => {
    rpcResults.set('pool_freshness', [
      { bucket: 'over_1_year', records: 1 },
      { bucket: 'under_7_days', records: 4 },
      { bucket: 'under_90_days', records: 2 },
    ])
    const result = await evaluatePool('pool-1', 'org-1')
    expect(result.freshness.map((entry) => entry.bucket)).toEqual([
      'under_7_days',
      'under_90_days',
      'over_1_year',
    ])
    expect(result.freshness[0].label).toBe('Last 7 days')
  })

  it('offers no sample for an unclassified schema', async () => {
    rpcResults.set('pool_schema_mix', [
      { schema_type: 'employment', records: 6 },
      { schema_type: 'unclassified', records: 2 },
    ])
    const result = await evaluatePool('pool-1', 'org-1')
    expect(Object.keys(result.samples)).toEqual(['employment'])
  })
})
