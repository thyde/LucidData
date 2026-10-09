import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above ordinary declarations, so anything they
// close over has to be hoisted too.
const { transfersCreate, transfersList, holdPayoutsForReview } = vi.hoisted(() => ({
  transfersCreate: vi.fn(),
  transfersList: vi.fn(),
  holdPayoutsForReview: vi.fn(),
}))

vi.mock('@/lib/repositories/payout.repository', () => ({
  findAccount: vi.fn(),
  findPendingPayouts: vi.fn(),
  findPayoutsByUser: vi.fn(),
  findPayoutsByOrder: vi.fn(),
  createPayout: vi.fn(),
  updatePayout: vi.fn(),
  updatePendingPayout: vi.fn(),
}))

vi.mock('@/lib/repositories/data-order.repository', () => ({ findOrderRecords: vi.fn() }))
vi.mock('@/lib/repositories/pool.repository', () => ({ findPoolById: vi.fn() }))

vi.mock('@/lib/stripe/client', () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ transfers: { create: transfersCreate, list: transfersList } }),
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
import * as orderRepo from '@/lib/repositories/data-order.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { processPendingPayouts, flushOwedBalance, recordOrderPayouts } from '../payout.service'
import { PAYOUT_REVIEW_THRESHOLD_CENTS } from '@/lib/constants/marketplace-integrity'
import type { DataOrder, DataOrderRecord, DataPool, Payout, PayoutAccount } from '@/types/database.types'

function payout(amountCents: number, id = 'payout-1'): Payout {
  return {
    id,
    user_id: 'user-1',
    amount_cents: amountCents,
    attempts: 0,
    status: 'pending',
    gross_cents: amountCents,
    platform_fee_cents: 0,
  } as Payout
}

beforeEach(() => {
  vi.clearAllMocks()
  transfersCreate.mockResolvedValue({ id: 'tr_1' })
  transfersList.mockResolvedValue({ data: [] })
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

describe('sending a payout when an account can take it', () => {
  it('keeps a sent payout paid when its audit entry or notice fails', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(5000)])
    const { createAuditEntry } = await import('@/lib/services/audit.service')
    const { notifyPayoutPaid } = await import('@/lib/services/marketplace-notification.service')
    vi.mocked(createAuditEntry).mockRejectedValue({ code: 'PT409' })
    vi.mocked(notifyPayoutPaid).mockRejectedValue(new Error('mail is down'))

    await processPendingPayouts('user-1')

    expect(payoutRepo.updatePayout).toHaveBeenCalledTimes(1)
    expect(vi.mocked(payoutRepo.updatePayout).mock.calls[0][1]).toMatchObject({ status: 'paid' })
    expect(transfersCreate.mock.calls[0][1]).toEqual({ idempotencyKey: 'payout-payout-1-0' })
  })

  it('counts a refused transfer, so the retry is a new request rather than a replay', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(5000)])
    transfersCreate.mockRejectedValue(
      Object.assign(new Error('capability not active yet'), { type: 'StripeInvalidRequestError', statusCode: 400 })
    )

    await processPendingPayouts('user-1')

    expect(vi.mocked(payoutRepo.updatePendingPayout).mock.calls[0]).toEqual([
      'payout-1',
      0,
      { attempts: 1, last_error: 'capability not active yet' },
    ])
  })

  it('leaves the attempts alone when Stripe did not answer, so the retry finds the transfer', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(5000)])
    transfersCreate.mockRejectedValue(Object.assign(new Error('timeout'), { type: 'StripeAPIError', statusCode: 500 }))

    await processPendingPayouts('user-1')

    expect(payoutRepo.updatePendingPayout).not.toHaveBeenCalled()
    expect(payoutRepo.updatePayout).not.toHaveBeenCalled()
  })

  it('leaves a payout as it was when its transfer went through but could not be recorded', async () => {
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([payout(5000)])
    vi.mocked(payoutRepo.updatePayout).mockRejectedValueOnce(new Error('connection reset'))

    await processPendingPayouts('user-1')

    // The attempt count, and so the key, stay put for the next try.
    expect(payoutRepo.updatePayout).toHaveBeenCalledTimes(1)
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

describe('recording what an order owes', () => {
  const order = { id: 'order-1', pool_id: 'pool-1' } as DataOrder

  function record(id: string, payoutCents: number, userId: string | null = 'user-1'): DataOrderRecord {
    return {
      id,
      order_id: order.id,
      source_contribution_id: `contribution-${id}`,
      source_user_id: userId,
      payout_cents: payoutCents,
    } as DataOrderRecord
  }

  beforeEach(() => {
    vi.mocked(payoutRepo.findPayoutsByOrder).mockResolvedValue([])
    vi.mocked(payoutRepo.findPendingPayouts).mockResolvedValue([])
  })

  it('never owes more for a record than the buyer paid for it', async () => {
    // An order snapshotted before releases were capped can hold a forged value.
    vi.mocked(poolRepo.findPoolById).mockResolvedValue({
      name: 'Synthetic pool',
      price_per_record_cents: 1000,
    } as DataPool)
    vi.mocked(orderRepo.findOrderRecords).mockResolvedValue([record('a', 15000), record('b', 1000)])

    await recordOrderPayouts(order)

    const created = vi.mocked(payoutRepo.createPayout).mock.calls.map(([row]) => row)
    expect(created.map((row) => row.gross_cents)).toEqual([1000, 1000])
    expect(created.map((row) => row.amount_cents)).toEqual([750, 750])
  })

  it('owes nothing for records in a free pool, whatever they claim', async () => {
    vi.mocked(poolRepo.findPoolById).mockResolvedValue({
      name: 'Free pool',
      price_per_record_cents: 0,
    } as DataPool)
    vi.mocked(orderRepo.findOrderRecords).mockResolvedValue([record('a', 15000)])

    await recordOrderPayouts(order)

    expect(payoutRepo.createPayout).not.toHaveBeenCalled()
  })
})
