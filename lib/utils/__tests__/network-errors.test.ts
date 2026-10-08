import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  CAPTCHA_FAILED_MESSAGE,
  EMAIL_NOT_CONFIRMED_MESSAGE,
  NETWORK_FAILED_MESSAGE,
  getAuthErrorMessage,
} from '@/lib/utils/network-errors'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getAuthErrorMessage', () => {
  it('explains a CAPTCHA refusal in plain words', () => {
    const error = {
      code: 'captcha_failed',
      message: 'captcha protection: request disallowed (no captcha_token found)',
    }
    expect(getAuthErrorMessage(error)).toBe(CAPTCHA_FAILED_MESSAGE)
  })

  it('recognises the refusal from its message when no code is present', () => {
    expect(
      getAuthErrorMessage(new Error('captcha protection: request disallowed (timeout-or-duplicate)'))
    ).toBe(CAPTCHA_FAILED_MESSAGE)
  })

  it('passes other auth messages through unchanged', () => {
    expect(getAuthErrorMessage(new Error('Invalid login credentials'))).toBe(
      'Invalid login credentials'
    )
  })

  it('tells someone with an unconfirmed address what to do', () => {
    expect(getAuthErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
      EMAIL_NOT_CONFIRMED_MESSAGE
    )
    expect(getAuthErrorMessage(new Error('Email not confirmed'))).toBe(EMAIL_NOT_CONFIRMED_MESSAGE)
  })

  it('keeps setup instructions out of what production users see', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const message = getAuthErrorMessage(new TypeError('Failed to fetch'))
    expect(message).toBe(NETWORK_FAILED_MESSAGE)
    expect(message).not.toMatch(/supabase/i)
  })

  it('still gives a developer the local setup hint', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(getAuthErrorMessage(new TypeError('Failed to fetch'))).toMatch(/npx supabase start/)
  })
})
