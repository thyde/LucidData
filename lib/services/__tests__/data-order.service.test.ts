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
  name: 'Synthetic interests',
  category: 'interests',
  purpose: 'ai_training',
  retention_days: 30,
  minimum_contributors: 5,
  price_cents: 0,
  price_per_record_cents: 0,
} as DataPool

const contributions = Array.from({ length: 5 }, (_, index) => ({
  id: `contribution-${index}`,
  user_id: `user-${index}`,
  category: 'interests',
  anonymized_payload: { topic: `synthetic-${index}` },
  payout_cents: 0,
  pool_id: pool.id,
  vault_data_id: null,
  status: 'active',
  consented_at: new Date().toISOString(),
  consent_version: '2026-07-25',
  declared_purpose: pool.purpose,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})) satisfies PoolContribution[]

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
      },
    ])
    expect(contributionRepo.findActiveContributionsByPool).not.toHaveBeenCalled()
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