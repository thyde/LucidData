import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above ordinary declarations, so anything they
// close over has to be hoisted too.
const { transfersCreate, holdPayoutsForReview } = vi.hoisted(() => ({
  transfersCreate: vi.fn(),
  holdPayoutsForReview: vi.fn(),
}))

vi.mock('@/lib/repositories/payout.repository', () => ({
  findAccount: vi.fn(),
  findPendingPayouts: vi.fn(),
  findPayoutsByUser: vi.fn(),
  updatePayout: vi.fn(),
}))

vi.mock('@/lib/repositories/data-order.repository', () => ({}))
vi.mock('@/lib/repositories/pool.repository', () => ({ findPoolById: vi.fn() }))

vi.mock('@/lib/stripe/client', () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ transfers: { create: transfersCreate } }),
}))

vi.mock('@/lib/services/audit.service', () => ({ createAuditEntry: vi.fn() }))
vi.mock('@/lib/services/marketplace-notification.service', () => ({
  notifyDataSold: vi.fn(),
  notifyPayoutPaid: vi.fn(),
}))

vi.mock('@/lib/services/marketplace-integrity.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/services/marketplace-integrity.service')
  >('@/lib/services/marketplace-integrity.service')
  return { shouldHoldPayout: actual.shouldHoldPayout, holdPayoutsForReview }
})

import * as payoutRepo from '@/lib/repositories/payout.repository'
import { processPendingPayouts, flushOwedBalance } from '../payout.service'
import { PAYOUT_REVIEW_THRESHOLD_CENTS } from '@/lib/constants/marketplace-integrity'
import type { Payout, PayoutAccount } from '@/types/database.types'

function payout(amountCents: number, id = 'payout-1'): Payout {
  return {
    id,
    user_id: 'user-1',
    amount_cents: amountCents,
    status: 'pending',
    gross_cents: amountCents,
    platform_fee_cents: 0,
  } as Payout
}

beforeEach(() => {
  vi.clearAllMocks()
  transfersCreate.mockResolvedValue({ id: 'tr_1' })
  vi.mocked(payoutRepo.findAccount).mockResolvedValue({
    user_id: 'user-1',
    stripe_account_id: 'acct_1',
    payouts_enabled: true,
  } as PayoutAccount)
})

describe('holding a large payout', () => {
  it('holds a balance at or above the review threshold instead of sending it', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([
      payout(PAYOUT_REVIEW_THRESHOLD_CENTS),
    ])

    await processPendingPayouts('user-1')

    expect(holdPayoutsForReview).toHaveBeenCalledOnce()
    expect(transfersCreate).not.toHaveBeenCalled()
  })

  it('sends an ordinary balance without a hold', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(5000)])

    await processPendingPayouts('user-1')

    expect(holdPayoutsForReview).not.toHaveBeenCalled()
    expect(transfersCreate).toHaveBeenCalledOnce()
  })
})

describe('closing an account with money owed', () => {
  // LD-505 requires that a closing account is paid whatever it is owed, and
  // LD-506 introduced a status that a normal run deliberately ignores. Without
  // this test the two combine into money that is owed, held, and unreachable,
  // which is the worst outcome either spec could produce.

  it('includes held payouts when flushing an owed balance', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(1000)])

    await flushOwedBalance('user-1')

    expect(payoutRepo.findPendingPayouts).toHaveBeenCalledWith('user-1', {
      includeHeld: true,
    })
  })

  it('ignores held payouts on an ordinary run', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(5000)])

    await processPendingPayouts('user-1')

    expect(payoutRepo.findPendingPayouts).toHaveBeenCalledWith('user-1', {
      includeHeld: false,
    })
  })

  it('pays a held balance rather than holding it again', async () => {
    // The amount is above the review threshold, so an ordinary run would hold
    // it. Closure must send it anyway.
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([
      payout(PAYOUT_REVIEW_THRESHOLD_CENTS * 2),
    ])

    await flushOwedBalance('user-1')

    expect(holdPayoutsForReview).not.toHaveBeenCalled()
    expect(transfersCreate).toHaveBeenCalledOnce()
  })

  it('pays a balance below the normal threshold on closure', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(60)])

    await flushOwedBalance('user-1')

    expect(transfersCreate).toHaveBeenCalledOnce()
  })
})
