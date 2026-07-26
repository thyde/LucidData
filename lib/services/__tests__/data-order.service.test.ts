import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/data-order.repository', () => ({
  createOrder: vi.fn(),
  deleteOrder: vi.fn(),
  createOrderRecords: vi.fn(),
  findOrderByToken: vi.fn(),
  findOrderRecords: vi.fn(),
}))
vi.mock('@/lib/repositories/contribution.repository', () => ({
  findActiveContributionsByPool: vi.fn(),
}))
vi.mock('@/lib/repositories/pool.repository', () => ({
  findPoolByOrg: vi.fn(),
}))
vi.mock('@/lib/services/audit.service', () => ({ createAuditEntry: vi.fn() }))
vi.mock('@/lib/services/payout.service', () => ({ recordOrderPayouts: vi.fn() }))
vi.mock('@/lib/stripe/client', () => ({
  isStripeConfigured: vi.fn(() => false),
  getStripe: vi.fn(),
}))

import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as orderRepo from '@/lib/repositories/data-order.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { getExport, startPoolPurchase } from '@/lib/services/data-order.service'
import type { DataOrder, DataOrderRecord, DataPool, PoolContribution } from '@/types/database.types'

const pool = {
  id: 'pool-1',
  buyer_org_id: 'org-1',
  name: 'Synthetic employment',
  category: 'credentials',
  purpose: 'ai_training',
  retention_days: 30,
  minimum_contributors: 5,
  k_anonymity_target: 5,
  epsilon_budget: 5,
  epsilon_spent: 0,
  price_cents: 0,
  price_per_record_cents: 0,
} as DataPool

// LD-501: the gate classifies fields per vault schema, so a contribution needs
// a schema it recognizes. All five share their quasi-identifiers, which puts
// them in one equivalence class of five and meets k.
const contributions = Array.from({ length: 5 }, (_, index) => ({
  id: `contribution-${index}`,
  user_id: `user-${index}`,
  category: 'credentials',
  schema_type: 'employment',
  anonymized_payload: {
    employer: 'Acme',
    role: 'Engineer',
    start_date: '2020-01-01',
    employment_type: 'full_time',
    currency: 'USD',
    salary_range: '60k-100k',
  },
  payout_cents: 0,
  platform_fee_bps: 2500,
  pool_id: pool.id,
  vault_data_id: null,
  status: 'active',
  consented_at: new Date().toISOString(),
  consent_version: '2026-07-25',
  declared_purpose: pool.purpose,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  __index: index,
})).map(({ __index, ...contribution }) => {
  void __index
  return contribution
}) satisfies PoolContribution[]

const order = {
  id: 'order-1',
  pool_id: pool.id,
  buyer_org_id: pool.buyer_org_id,
  order_type: 'snapshot',
  status: 'paid',
  export_token: 'token',
  export_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  record_count: contributions.length,
  total_cents: 0,
} as DataOrder

describe('data order snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(poolRepo.findPoolByOrg).mockResolvedValue(pool)
    vi.mocked(contributionRepo.findActiveContributionsByPool).mockResolvedValue(contributions)
    vi.mocked(orderRepo.createOrder).mockResolvedValue(order)
    vi.mocked(orderRepo.createOrderRecords).mockResolvedValue([])
  })

  it('rejects a purchase below the minimum cohort', async () => {
    vi.mocked(contributionRepo.findActiveContributionsByPool).mockResolvedValue(
      contributions.slice(0, 4)
    )

    await expect(
      startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
        pool_id: pool.id,
        order_type: 'snapshot',
      })
    ).rejects.toThrow('needs at least 5 contributors')
    expect(orderRepo.createOrder).not.toHaveBeenCalled()
  })

  it('counts distinct contributors rather than duplicate records', async () => {
    vi.mocked(contributionRepo.findActiveContributionsByPool).mockResolvedValue(
      contributions.map((contribution) => ({ ...contribution, user_id: 'one-user' }))
    )

    await expect(
      startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
        pool_id: pool.id,
        order_type: 'snapshot',
      })
    ).rejects.toThrow('needs at least 5 contributors')
    expect(orderRepo.createOrder).not.toHaveBeenCalled()
  })

  it('snapshots the exact records used for pricing', async () => {
    await startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
      pool_id: pool.id,
      order_type: 'snapshot',
    })

    expect(orderRepo.createOrderRecords).toHaveBeenCalledWith(
      contributions.map((contribution) => ({
        order_id: order.id,
        source_contribution_id: contribution.id,
        source_user_id: contribution.user_id,
        category: contribution.category,
        payload: contribution.anonymized_payload,
        payout_cents: contribution.payout_cents,
        contributed_at: contribution.created_at,
      }))
    )
  })

  it('attaches a privacy report to the order', async () => {
    await startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
      pool_id: pool.id,
      order_type: 'snapshot',
    })

    const [created] = vi.mocked(orderRepo.createOrder).mock.calls[0]
    const report = (created as unknown as {
      privacy_report: { k: number; kTarget: number }
    }).privacy_report
    expect(report.kTarget).toBe(5)
    expect(report.k).toBeGreaterThanOrEqual(5)
  })

  it('refuses to reach Checkout when the release cannot meet k', async () => {
    // The pool demands a cohort of ten and only five people contributed. A
    // count of contributors against minimum_contributors would let this
    // through; the privacy gate does not.
    vi.mocked(poolRepo.findPoolByOrg).mockResolvedValue({
      ...pool,
      k_anonymity_target: 10,
    } as DataPool)

    await expect(
      startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
        pool_id: pool.id,
        order_type: 'snapshot',
      })
    ).rejects.toThrow(/cannot be released/i)
    expect(orderRepo.createOrder).not.toHaveBeenCalled()
  })

  it('generalizes hard rather than releasing a cohort of one', async () => {
    // Everyone unique on every quasi-identifier. The gate widens until they
    // share a class, which is the whole point: the buyer gets a decade, not a
    // start date.
    vi.mocked(contributionRepo.findActiveContributionsByPool).mockResolvedValue(
      contributions.map((contribution, index) => ({
        ...contribution,
        anonymized_payload: {
          employer: `Employer ${index}`,
          role: `Role ${index}`,
          start_date: `202${index}-0${index + 1}-01`,
          salary_range: '60k-100k',
        },
      }))
    )

    await startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
      pool_id: pool.id,
      order_type: 'snapshot',
    })

    const [created] = vi.mocked(orderRepo.createOrder).mock.calls[0]
    const report = (created as unknown as {
      privacy_report: {
        k: number
        generalizations: { field: string; label: string }[]
      }
    }).privacy_report
    expect(report.k).toBeGreaterThanOrEqual(5)
    const employer = report.generalizations.find((entry) => entry.field === 'employer')
    expect(employer?.label).toBe('suppressed')

    const [records] = vi.mocked(orderRepo.createOrderRecords).mock.calls[0]
    const payload = records[0].payload as Record<string, unknown>
    expect(payload).not.toHaveProperty('employer')
    expect(payload.start_date).toBe('2020s')
    // The sensitive value the buyer actually wanted still comes through.
    expect(payload.salary_range).toBe('60k-100k')
  })

  it('refuses a release built from an unclassified schema', async () => {
    vi.mocked(contributionRepo.findActiveContributionsByPool).mockResolvedValue(
      contributions.map((contribution) => ({
        ...contribution,
        schema_type: null,
        anonymized_payload: { topic: 'free form' },
      }))
    )

    await expect(
      startPoolPurchase(pool.buyer_org_id, 'buyer-1', {
        pool_id: pool.id,
        order_type: 'snapshot',
      })
    ).rejects.toThrow(/cannot be released/i)
    expect(orderRepo.createOrder).not.toHaveBeenCalled()
  })

  it('exports the purchased snapshot rather than current pool contents', async () => {
    const record = {
      id: 'record-1',
      order_id: order.id,
      source_contribution_id: contributions[0].id,
      source_user_id: contributions[0].user_id,
      category: 'interests',
      payload: { topic: 'purchased-snapshot' },
      payout_cents: 0,
      contributed_at: contributions[0].created_at,
      created_at: new Date().toISOString(),
      redacted_at: null,
    } satisfies DataOrderRecord
    vi.mocked(orderRepo.findOrderByToken).mockResolvedValue(order)
    vi.mocked(orderRepo.findOrderRecords).mockResolvedValue([record])

    const result = await getExport(pool.buyer_org_id, 'buyer-1', order.export_token)

    expect(result.records).toEqual([
      {
        id: contributions[0].id,
        category: 'interests',
        payload: { topic: 'purchased-snapshot' },
        contributed_at: contributions[0].created_at,
        redacted: false,
      },
    ])
    expect(contributionRepo.findActiveContributionsByPool).not.toHaveBeenCalled()
  })

  it('flags a record whose contributor erased their account', async () => {
    vi.mocked(orderRepo.findOrderByToken).mockResolvedValue(order)
    vi.mocked(orderRepo.findOrderRecords).mockResolvedValue([
      {
        id: 'record-1',
        order_id: order.id,
        source_contribution_id: null,
        source_user_id: null,
        category: 'credentials',
        payload: {},
        payout_cents: 0,
        contributed_at: contributions[0].created_at,
        created_at: new Date().toISOString(),
        redacted_at: new Date().toISOString(),
      } satisfies DataOrderRecord,
    ])

    const result = await getExport(pool.buyer_org_id, 'buyer-1', order.export_token)
    // LD-607: the row survives as a counted placeholder, and the buyer is told.
    expect(result.records[0].redacted).toBe(true)
    expect(result.records[0].payload).toEqual({})
  })

  it('rejects an expired export token', async () => {
    vi.mocked(orderRepo.findOrderByToken).mockResolvedValue({
      ...order,
      export_expires_at: new Date(Date.now() - 1_000).toISOString(),
    })

    await expect(getExport(pool.buyer_org_id, 'buyer-1', order.export_token)).rejects.toThrow(
      'This export link has expired'
    )
  })
})