import { describe, it, expect, beforeEach } from 'vitest'
import {
  OAuthStateError,
  isConnectorStorageConfigured,
  signState,
  unwrapToken,
  verifyState,
  wrapToken,
} from '@/lib/services/connector-tokens'

/**
 * LD-201: provider tokens are the one place the server holds a key that opens
 * something, and the OAuth state is the only thing standing between a person's
 * vault and someone else's provider account.
 */

const SECRET = Buffer.alloc(32, 5).toString('base64')

beforeEach(() => {
  process.env.CONNECTOR_TOKEN_SECRET = SECRET
})

describe('token wrapping', () => {
  it('round-trips a token', () => {
    const wrapped = wrapToken('provider-access-token')
    expect(unwrapToken(wrapped)).toBe('provider-access-token')
  })

  it('never stores the token in the clear', () => {
    const wrapped = wrapToken('provider-access-token')
    expect(wrapped.ciphertext).not.toContain('provider-access-token')
    expect(JSON.stringify(wrapped)).not.toContain('provider-access-token')
  })

  it('produces different ciphertext for the same token', () => {
    expect(wrapToken('same').ciphertext).not.toBe(wrapToken('same').ciphertext)
  })

  it('refuses a tampered ciphertext rather than returning something', () => {
    const wrapped = wrapToken('provider-access-token')
    const bytes = Buffer.from(wrapped.ciphertext, 'base64')
    bytes[0] ^= 0xff
    expect(() =>
      unwrapToken({ ...wrapped, ciphertext: bytes.toString('base64') })
    ).toThrow()
  })

  it('refuses a token wrapped under a different secret', () => {
    const wrapped = wrapToken('provider-access-token')
    process.env.CONNECTOR_TOKEN_SECRET = Buffer.alloc(32, 9).toString('base64')
    expect(() => unwrapToken(wrapped)).toThrow()
  })

  it('refuses to operate without a configured secret', () => {
    delete process.env.CONNECTOR_TOKEN_SECRET
    expect(isConnectorStorageConfigured()).toBe(false)
    expect(() => wrapToken('x')).toThrow(/CONNECTOR_TOKEN_SECRET/)
  })

  it('refuses a secret of the wrong length', () => {
    process.env.CONNECTOR_TOKEN_SECRET = Buffer.alloc(16, 1).toString('base64')
    expect(() => wrapToken('x')).toThrow(/32-byte/)
  })
})

describe('OAuth state', () => {
  it('verifies a state it signed', () => {
    const state = signState({ userId: 'user-1', provider: 'strava' })
    const verified = verifyState(state)
    expect(verified.userId).toBe('user-1')
    expect(verified.provider).toBe('strava')
  })

  it('refuses a state signed with a different secret', () => {
    const state = signState({ userId: 'user-1', provider: 'strava' })
    process.env.CONNECTOR_TOKEN_SECRET = Buffer.alloc(32, 9).toString('base64')
    expect(() => verifyState(state)).toThrow(OAuthStateError)
  })

  it('refuses a state whose body was edited', () => {
    // Swapping the user id is exactly the attack: attaching your provider
    // account to somebody else's vault.
    const state = signState({ userId: 'user-1', provider: 'strava' })
    const [, signature] = state.split('.')
    const forged = Buffer.from(
      JSON.stringify({
        userId: 'victim',
        provider: 'strava',
        nonce: 'x',
        expiresAt: Date.now() + 60_000,
      })
    ).toString('base64url')
    expect(() => verifyState(`${forged}.${signature}`)).toThrow(OAuthStateError)
  })

  it('refuses an expired state', () => {
    const state = signState({ userId: 'user-1', provider: 'strava' })
    expect(() => verifyState(state, Date.now() + 60 * 60 * 1000)).toThrow(/expired/)
  })

  it('refuses a malformed state', () => {
    expect(() => verifyState('garbage')).toThrow(OAuthStateError)
    expect(() => verifyState('only-one-part')).toThrow(OAuthStateError)
  })

  it('gives every state a fresh nonce', () => {
    const first = verifyState(signState({ userId: 'u', provider: 'strava' }))
    const second = verifyState(signState({ userId: 'u', provider: 'strava' }))
    expect(first.nonce).not.toBe(second.nonce)
  })

  it('expires within ten minutes', () => {
    const verified = verifyState(signState({ userId: 'u', provider: 'strava' }))
    expect(verified.expiresAt - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000)
  })
})
