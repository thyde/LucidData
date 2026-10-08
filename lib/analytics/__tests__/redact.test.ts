import { describe, it, expect } from 'vitest'
import { redactAnalyticsEvent } from '@/lib/analytics/redact'

const pageview = (url: string) => ({ type: 'pageview' as const, url })

describe('redactAnalyticsEvent', () => {
  it.each([
    'https://luciddatabank.com/',
    'https://luciddatabank.com/pricing',
    'https://luciddatabank.com/for-individuals',
    'https://luciddatabank.com/trust',
    'https://luciddatabank.com/trust/threat-model',
    'https://luciddatabank.com/login',
  ])('keeps the public page %s', (url) => {
    expect(redactAnalyticsEvent(pageview(url))).toEqual(pageview(url))
  })

  it('strips query strings, fragments, and trailing slashes', () => {
    expect(redactAnalyticsEvent(pageview('https://luciddatabank.com/pricing/?utm_source=x&email=a@b.co#plans'))).toEqual(
      pageview('https://luciddatabank.com/pricing')
    )
  })

  it.each([
    'https://luciddatabank.com/vault',
    'https://luciddatabank.com/dashboard',
    'https://luciddatabank.com/settings',
    'https://luciddatabank.com/consent',
    'https://luciddatabank.com/verify/Qm9vbGVhbkNvbnN0YW50c0FyZU5vdFNlY3JldHM',
    'https://luciddatabank.com/verify/receipt/6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
    'https://luciddatabank.com/org/invite/Qm9vbGVhbkNvbnN0YW50c0FyZU5vdFNlY3JldHM',
    'https://luciddatabank.com/recover-vault',
    'https://luciddatabank.com/confirm-email?token_hash=pkce_0123456789abcdef&type=email',
    'https://luciddatabank.com/trusted-partner',
  ])('drops the private page %s', (url) => {
    expect(redactAnalyticsEvent(pageview(url))).toBeNull()
  })

  it('drops an event whose URL cannot be parsed', () => {
    expect(redactAnalyticsEvent(pageview('not a url'))).toBeNull()
  })
})
