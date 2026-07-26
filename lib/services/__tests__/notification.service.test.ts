import { describe, it, expect, beforeEach, vi } from 'vitest'

const insertNotification = vi.fn()
const getEmailNotificationsEnabled = vi.fn()
const sendNotificationEmail = vi.fn()
const logSpy = vi.fn()

vi.mock('next/server', () => ({
  // Run the deferred task inline so the test can await its effects.
  after: (task: () => Promise<void>) => {
    void task()
  },
}))

vi.mock('@/lib/repositories/notification.repository', () => ({
  insertNotification: (...args: unknown[]) => insertNotification(...args),
}))

vi.mock('@/lib/repositories/user.repository', () => ({
  getEmailNotificationsEnabled: (...args: unknown[]) => getEmailNotificationsEnabled(...args),
}))

vi.mock('@/lib/services/notification-email.service', () => ({
  resolveTransport: () => 'resend',
  sendNotificationEmail: (...args: unknown[]) => sendNotificationEmail(...args),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: (...args: unknown[]) => logSpy(...args) },
}))

const { createNotification } = await import('@/lib/services/notification.service')

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createNotification', () => {
  beforeEach(() => {
    insertNotification.mockReset().mockResolvedValue(undefined)
    getEmailNotificationsEnabled.mockReset().mockResolvedValue(true)
    sendNotificationEmail.mockReset().mockResolvedValue(undefined)
    logSpy.mockReset()
  })

  it('deep links a consent request to the requests page', async () => {
    await createNotification({
      userId: 'user-1',
      type: 'consent_request',
      title: 'Acme requested access',
      message: 'Review the request.',
      relatedEntityType: 'consent_request',
      email: 'person@example.com',
    })
    await flush()

    expect(sendNotificationEmail).toHaveBeenCalledWith('person@example.com', {
      title: 'Acme requested access',
      message: 'Review the request.',
      deepLinkPath: '/requests',
    })
  })

  it('records the in-app notification and logs once when delivery fails', async () => {
    sendNotificationEmail.mockRejectedValue(new Error('transport unavailable'))

    await expect(
      createNotification({
        userId: 'user-1',
        type: 'consent_request',
        title: 'Acme requested access',
        message: 'Review the request.',
        relatedEntityType: 'consent_request',
        email: 'person@example.com',
      })
    ).resolves.toBeUndefined()
    await flush()

    expect(insertNotification).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps the recipient, subject, and body out of the failure log', async () => {
    sendNotificationEmail.mockRejectedValue(new Error('transport unavailable'))

    await createNotification({
      userId: 'user-1',
      type: 'consent_request',
      title: 'Acme requested access',
      message: 'Review the request.',
      relatedEntityType: 'consent_request',
      email: 'person@example.com',
    })
    await flush()

    const serialized = JSON.stringify(logSpy.mock.calls)
    expect(serialized).not.toContain('person@example.com')
    expect(serialized).not.toContain('Acme requested access')
    expect(serialized).not.toContain('Review the request.')
  })

  it('suppresses email but still records the notification when the user opted out', async () => {
    getEmailNotificationsEnabled.mockResolvedValue(false)

    await createNotification({
      userId: 'user-1',
      type: 'security_alert',
      title: 'Backup code used',
      message: 'A backup code was used.',
      relatedEntityType: 'security',
      email: 'person@example.com',
    })
    await flush()

    expect(insertNotification).toHaveBeenCalledTimes(1)
    expect(sendNotificationEmail).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })
})
