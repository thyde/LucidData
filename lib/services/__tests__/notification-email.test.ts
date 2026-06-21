import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  resolveTransport,
  renderNotificationEmail,
} from '@/lib/services/notification-email.service'

const ENV_KEYS = ['EMAIL_TRANSPORT', 'RESEND_API_KEY', 'NEXT_PUBLIC_APP_URL'] as const

describe('resolveTransport', () => {
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = {}
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('honors an explicit EMAIL_TRANSPORT', () => {
    process.env.EMAIL_TRANSPORT = 'console'
    expect(resolveTransport()).toBe('console')
    process.env.EMAIL_TRANSPORT = 'smtp'
    expect(resolveTransport()).toBe('smtp')
    process.env.EMAIL_TRANSPORT = 'resend'
    expect(resolveTransport()).toBe('resend')
  })

  it('falls back to resend when only RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 'rk_test'
    expect(resolveTransport()).toBe('resend')
  })

  it('defaults to none with no configuration', () => {
    expect(resolveTransport()).toBe('none')
  })

  it('ignores an unknown transport and falls back to none', () => {
    process.env.EMAIL_TRANSPORT = 'carrier-pigeon'
    expect(resolveTransport()).toBe('none')
  })
})

describe('renderNotificationEmail', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
  })

  it('uses the title as the subject', () => {
    const { subject } = renderNotificationEmail({ title: 'New credential received', message: 'hi' })
    expect(subject).toBe('New credential received')
  })

  it('builds an absolute deep link from the path', () => {
    const { text, html } = renderNotificationEmail({
      title: 'New credential request',
      message: 'Acme requested credentials.',
      deepLinkPath: '/requests',
    })
    expect(text).toContain('https://app.example.com/requests')
    expect(html).toContain('href="https://app.example.com/requests"')
    expect(html).toContain('https://app.example.com/settings')
  })

  it('falls back to the dashboard when no deep link path is given', () => {
    const { html } = renderNotificationEmail({ title: 'Heads up', message: 'something happened' })
    expect(html).toContain('href="https://app.example.com/dashboard"')
  })

  it('escapes HTML in user-supplied strings', () => {
    const { html } = renderNotificationEmail({
      title: '<script>alert(1)</script>',
      message: 'Acme & Co "quoted"',
    })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Acme &amp; Co &quot;quoted&quot;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
