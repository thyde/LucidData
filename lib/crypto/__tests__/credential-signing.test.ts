import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import { generateIssuerKey, signWithPrivateKey } from '@/lib/crypto/credential-signing'
import { canonicalize, verifyCredentialSignature } from '@/lib/crypto/credential-verify'

beforeAll(() => {
  // Server-custody wrapping key used to encrypt issuer private keys at rest.
  process.env.ISSUER_KEY_SECRET = crypto.randomBytes(32).toString('base64')
})

describe('canonicalize', () => {
  it('sorts object keys deterministically regardless of insertion order', () => {
    const a = canonicalize({ b: 1, a: 2, c: { z: 1, y: 2 } })
    const b = canonicalize({ c: { y: 2, z: 1 }, a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('preserves array order', () => {
    expect(canonicalize({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}')
  })
})

describe('issuer credential signing', () => {
  const payload = {
    type: 'Diploma',
    issuer: 'org-123',
    subject: 'alice@example.com',
    claims: { degree: 'bachelor', field: 'CS', graduation_year: 2025 },
    issued_at: '2026-06-16T00:00:00.000Z',
  }

  it('round-trips: a signed payload verifies with its public key', () => {
    const key = generateIssuerKey()
    const signature = signWithPrivateKey(key.encryptedPrivateKey, key.privateKeyIv, payload)
    expect(verifyCredentialSignature(key.publicKey, payload, signature)).toBe(true)
  })

  it('verifies regardless of payload key ordering (canonicalization)', () => {
    const key = generateIssuerKey()
    const signature = signWithPrivateKey(key.encryptedPrivateKey, key.privateKeyIv, payload)
    const reordered = {
      issued_at: payload.issued_at,
      claims: { graduation_year: 2025, field: 'CS', degree: 'bachelor' },
      subject: payload.subject,
      issuer: payload.issuer,
      type: payload.type,
    }
    expect(verifyCredentialSignature(key.publicKey, reordered, signature)).toBe(true)
  })

  it('rejects a tampered payload', () => {
    const key = generateIssuerKey()
    const signature = signWithPrivateKey(key.encryptedPrivateKey, key.privateKeyIv, payload)
    const tampered = { ...payload, claims: { ...payload.claims, degree: 'master' } }
    expect(verifyCredentialSignature(key.publicKey, tampered, signature)).toBe(false)
  })

  it('rejects a signature verified against a different issuer key', () => {
    const key = generateIssuerKey()
    const otherKey = generateIssuerKey()
    const signature = signWithPrivateKey(key.encryptedPrivateKey, key.privateKeyIv, payload)
    expect(verifyCredentialSignature(otherKey.publicKey, payload, signature)).toBe(false)
  })

  it('produces unique key ids and public keys per generation', () => {
    const a = generateIssuerKey()
    const b = generateIssuerKey()
    expect(a.keyId).not.toBe(b.keyId)
    expect(a.publicKey).not.toBe(b.publicKey)
  })

  it('returns false for malformed public key instead of throwing', () => {
    expect(verifyCredentialSignature('not-a-key', payload, 'AAAA')).toBe(false)
  })
})
