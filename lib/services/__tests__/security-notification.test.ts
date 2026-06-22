import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn(async () => {}),
}))
vi.mock('@/lib/repositories/user.repository', () => ({
  getUserEmail: vi.fn(async () => 'user@example.com'),
}))

import {
  notifySecurityEvent,
  describeSecurityEvent,
  type SecurityNotificationEvent,
} from '@/lib/services/security-notification.service'
import { createNotification } from '@/lib/services/notification.service'
import { getUserEmail } from '@/lib/repositories/user.repository'

const EVENTS: SecurityNotificationEvent[] = [
  'two_factor_enabled',
  'two_factor_disabled',
  'backup_codes_generated',
  'backup_code_used',
  'password_changed',
  'vault_recovered',
  'recovery_code_generated',
]

describe('describeSecurityEvent', () => {
  it('returns a non-empty title and message for every event', () => {
    for (const event of EVENTS) {
      const copy = describeSecurityEvent(event)
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.message.length).toBeGreaterThan(0)
    }
  })

  it('keeps copy free of em dashes (humanizer)', () => {
    for (const event of EVENTS) {
      const copy = describeSecurityEvent(event)
      expect(copy.title).not.toContain('\u2014')
      expect(copy.message).not.toContain('\u2014')
    }
  })
})

describe('notifySecurityEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a security_alert notification routed to settings with the user email', async () => {
    await notifySecurityEvent('user-1', 'two_factor_disabled')

    expect(getUserEmail).toHaveBeenCalledWith('user-1')
    expect(createNotification).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(createNotification).mock.calls[0][0]
    expect(arg).toMatchObject({
      userId: 'user-1',
      type: 'security_alert',
      relatedEntityType: 'security',
      email: 'user@example.com',
    })
    expect(arg.title).toBe(describeSecurityEvent('two_factor_disabled').title)
    expect(arg.message).toBe(describeSecurityEvent('two_factor_disabled').message)
  })

  it('still posts the in-app notification when the email lookup fails', async () => {
    vi.mocked(getUserEmail).mockRejectedValueOnce(new Error('lookup failed'))

    await notifySecurityEvent('user-2', 'password_changed')

    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createNotification).mock.calls[0][0].email).toBeNull()
  })
})
