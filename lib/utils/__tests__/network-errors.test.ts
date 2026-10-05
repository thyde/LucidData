import { describe, it, expect } from 'vitest'
import { CAPTCHA_FAILED_MESSAGE, getAuthErrorMessage } from '@/lib/utils/network-errors'

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
})
