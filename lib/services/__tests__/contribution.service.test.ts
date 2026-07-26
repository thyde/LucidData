import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/contribution.repository', () => ({
  createContribution: vi.fn(),
  findContributionsByUser: vi.fn(),
}))

vi.mock('@/lib/repositories/monetization.repository', () => ({
  findSalePreferences: vi.fn(),
  findFieldsByVault: vi.fn(),
}))

vi.mock('@/lib/repositories/pool.repository', () => ({
  findOpenPoolById: vi.fn(),
}))

vi.mock('@/lib/repositories/payout.repository', () => ({
  findPayoutsByUser: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: vi.fn(),
}))

vi.mock('@/lib/services/privacy-signal.service', () => ({
  assertNotUniversallyOptedOut: vi.fn(),
}))

// LD-506: the velocity check counts rows through the service client, and it runs
// before the repository calls below so a flood costs as little as possible.
// Stubbed here because these tests are about what contribute() accepts and
// refuses; the limit itself is covered in marketplace-integrity.service.test.ts.
vi.mock('@/lib/services/marketplace-integrity.service', () => ({
  assertContributionVelocity: vi.fn(),
  isDuplicateContribution: vi.fn().mockReturnValue(false),
  DuplicateContributionError: class DuplicateContributionError extends Error {},
}))

import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as monetizationRepo from '@/lib/repositories/monetization.repository'
import * as payoutRepo from '@/lib/repositories/payout.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertNotUniversallyOptedOut } from '@/lib/services/privacy-signal.service'
import { contribute, getEarnings } from '@/lib/services/contribution.service'
import type { DataPool, PoolContribution, Payout, SalePreferences } from '@/types/database.types'

const userId = 'user-1'
const pool = {
  id: 'pool-1',
  buyer_org_id: 'org-1',
  name: 'Synthetic health research',
  price_per_record_cents: 500,
  category: 'personal',
  purpose: 'research',
} as DataPool

const input = {
  pool_id: pool.id,
  vault_data_id: 'vault-1',
  category: 'health' as const,
  anonymized_payload: { condition_group: 'synthetic' },
  accepted_terms: true,
}

function preferences(overrides: Partial<SalePreferences> = {}): SalePreferences {
  return {
    min_price_cents: 0,
    blocked_buyer_orgs: [],
    ...overrides,
  } as SalePreferences
}

describe('contribute sale preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(poolRepo.findOpenPoolById).mockResolvedValue(pool)
    vi.mocked(monetizationRepo.findSalePreferences).mockResolvedValue(null)
    vi.mocked(monetizationRepo.findFieldsByVault).mockResolvedValue([
      { field_key: 'condition_group', opted_in: true } as never,
    ])
  })

  it('rejects a pool below the user minimum before persisting plaintext', async () => {
    vi.mocked(monetizationRepo.findSalePreferences).mockResolvedValue(
      preferences({ min_price_cents: 501 })
    )

    await expect(contribute(userId, input)).rejects.toThrow(
      'This pool pays less than your minimum price per record'
    )
    expect(contributionRepo.createContribution).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('rejects a buyer organization the user blocked', async () => {
    vi.mocked(monetizationRepo.findSalePreferences).mockResolvedValue(
      preferences({ blocked_buyer_orgs: [pool.buyer_org_id] })
    )

    await expect(contribute(userId, input)).rejects.toThrow(
      'You have blocked this buyer organization'
    )
    expect(contributionRepo.createContribution).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('rejects fields the user kept private', async () => {
    vi.mocked(monetizationRepo.findFieldsByVault).mockResolvedValue([])

    await expect(contribute(userId, input)).rejects.toThrow(
      'These fields are private: condition_group'
    )
    expect(contributionRepo.createContribution).not.toHaveBeenCalled()
  })

  it('rejects nested direct identifiers from a tampered client', async () => {
    const tampered = {
      ...input,
      anonymized_payload: { profile: { email: 'synthetic@example.com' } },
    }
    vi.mocked(monetizationRepo.findFieldsByVault).mockResolvedValue([
      { field_key: 'profile', opted_in: true } as never,
    ])

    await expect(contribute(userId, tampered)).rejects.toThrow(
      'The contribution contains a direct identifier'
    )
    expect(contributionRepo.createContribution).not.toHaveBeenCalled()
  })

  it('refuses before touching the pool when a universal opt-out is active', async () => {
    vi.mocked(assertNotUniversallyOptedOut).mockRejectedValueOnce(
      new Error('Your browser sends a universal opt-out signal')
    )

    await expect(contribute(userId, input)).rejects.toThrow('universal opt-out signal')
    expect(poolRepo.findOpenPoolById).not.toHaveBeenCalled()
    expect(contributionRepo.createContribution).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('getEarnings', () => {
  it('counts completed payouts instead of advertised contribution rates', async () => {
    const contribution = {
      id: 'contribution-1',
      category: 'health',
      payout_cents: 500,
      status: 'active',
    } as PoolContribution
    const paid = {
      contribution_id: contribution.id,
      amount_cents: 125,
      status: 'paid',
      created_at: new Date().toISOString(),
    } as Payout
    const pending = {
      contribution_id: contribution.id,
      amount_cents: 375,
      status: 'pending',
      created_at: new Date().toISOString(),
    } as Payout
    vi.mocked(contributionRepo.findContributionsByUser).mockResolvedValue([contribution])
    vi.mocked(payoutRepo.findPayoutsByUser).mockResolvedValue([paid, pending])

    await expect(getEarnings(userId)).resolves.toEqual({
      totalCents: 125,
      earnedThisMonthCents: 125,
      activeContributions: 1,
      byCategory: [{ category: 'health', cents: 125 }],
    })
  })
})