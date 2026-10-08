import { describe, it, expect } from 'vitest'
import { generateKeySalt } from '@/lib/crypto/key-derivation'
import { claimKeySaltSchema, confirmEmailSchema } from '@/lib/validations/account'

describe('claimKeySaltSchema', () => {
  it('accepts what generateKeySalt produces', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(claimKeySaltSchema.safeParse({ keySalt: generateKeySalt() }).success).toBe(true)
    }
  })

  it('refuses anything that is not a 32-byte salt', () => {
    for (const keySalt of ['', 'short', 'a'.repeat(44), `${'A'.repeat(43)}`, `${'A'.repeat(42)}==`]) {
      expect(claimKeySaltSchema.safeParse({ keySalt }).success, keySalt).toBe(false)
    }
  })
})

describe('confirmEmailSchema', () => {
  it('accepts the two confirmation types', () => {
    expect(confirmEmailSchema.safeParse({ tokenHash: 'abc', type: 'email' }).success).toBe(true)
    expect(confirmEmailSchema.safeParse({ tokenHash: 'abc', type: 'signup' }).success).toBe(true)
  })

  it('refuses token types that would sign someone in', () => {
    for (const type of ['recovery', 'magiclink', 'invite', 'email_change']) {
      expect(confirmEmailSchema.safeParse({ tokenHash: 'abc', type }).success, type).toBe(false)
    }
  })

  it('refuses a missing or oversized token', () => {
    expect(confirmEmailSchema.safeParse({ tokenHash: '', type: 'email' }).success).toBe(false)
    expect(confirmEmailSchema.safeParse({ tokenHash: null, type: 'email' }).success).toBe(false)
    expect(
      confirmEmailSchema.safeParse({ tokenHash: 'x'.repeat(513), type: 'email' }).success
    ).toBe(false)
  })
})
