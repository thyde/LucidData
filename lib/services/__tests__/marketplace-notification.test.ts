import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn(async () => {}),
}))
vi.mock('@/lib/repositories/user.repository', () => ({
  getUserEmail: vi.fn(async () => 'seller@example.com'),
}))

import {
  notifyDataSold,
  notifyPayoutPaid,
} from '@/lib/services/marketplace-notification.service'
import { createNotification } from '@/lib/services/notification.service'
import { getUserEmail } from '@/lib/repositories/user.repository'

describe('notifyDataSold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies the contributor with the amount and pool, routed to the marketplace', async () => {
    await notifyDataSold('u1', { poolName: 'Fitness 2026', amountCents: 1234, orderId: 'o1' })

    expect(getUserEmail).toHaveBeenCalledWith('u1')
    expect(createNotification).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(createNotification).mock.calls[0][0]
    expect(arg).toMatchObject({
      userId: 'u1',
      type: 'marketplace_sale',
      relatedEntityType: 'payout',
      relatedEntityId: 'o1',
      email: 'seller@example.com',
    })
    expect(arg.message).toContain('Fitness 2026')
    expect(arg.message).toContain('$12.34')
  })
})

describe('notifyPayoutPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies with the transfer amount and pool', async () => {
    await notifyPayoutPaid('u2', { poolName: 'Health', amountCents: 5000, payoutId: 'p1' })

    const arg = vi.mocked(createNotification).mock.calls[0][0]
    expect(arg).toMatchObject({
      userId: 'u2',
      type: 'marketplace_payout',
      relatedEntityType: 'payout',
      relatedEntityId: 'p1',
    })
    expect(arg.message).toContain('Health')
    expect(arg.message).toContain('$50.00')
  })

  it('still posts the in-app notification when the email lookup fails', async () => {
    vi.mocked(getUserEmail).mockRejectedValueOnce(new Error('lookup failed'))

    await notifyPayoutPaid('u3', { poolName: 'Health', amountCents: 100 })

    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createNotification).mock.calls[0][0].email).toBeNull()
  })
})
