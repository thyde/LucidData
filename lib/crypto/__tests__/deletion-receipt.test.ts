import { describe, it, expect, beforeAll } from 'vitest'
import { generateIssuerKey } from '@/lib/crypto/credential-signing'
import {
  DELETION_RECEIPT_VERSION,
  buildDeletionReceiptPayload,
  canonicalDeletionReceipt,
  hashSubjectEmail,
  signDeletionReceipt,
  verifyDeletionReceipt,
} from '@/lib/crypto/deletion-receipt'
import { RESIDUAL_DISCLOSURES } from '@/lib/constants/deletion-manifest'

// generateIssuerKey wraps the private half with ISSUER_KEY_SECRET.
process.env.ISSUER_KEY_SECRET =
  process.env.ISSUER_KEY_SECRET ?? Buffer.alloc(32, 7).toString('base64')

let key: ReturnType<typeof generateIssuerKey>

beforeAll(() => {
  key = generateIssuerKey()
})

function payload(overrides: Partial<Parameters<typeof buildDeletionReceiptPayload>[0]> = {}) {
  return buildDeletionReceiptPayload({
    receiptId: '11111111-1111-4111-8111-111111111111',
    issuedAt: '2026-07-26T00:00:00.000Z',
    subjectId: '22222222-2222-4222-8222-222222222222',
    subjectEmail: 'Person@Example.com',
    tables: [
      { table: 'vault_data', behaviour: 'cascade', affected: 0 },
      { table: 'issued_credentials', behaviour: 'explicit_delete', affected: 2 },
    ],
    residualTables: [],
    residualDisclosures: RESIDUAL_DISCLOSURES,
    ...overrides,
  })
}

describe('hashSubjectEmail', () => {
  it('is stable and case insensitive', () => {
    expect(hashSubjectEmail('Person@Example.com')).toBe(hashSubjectEmail('person@example.com'))
    expect(hashSubjectEmail(' person@example.com ')).toBe(hashSubjectEmail('person@example.com'))
  })

  it('separates different addresses', () => {
    expect(hashSubjectEmail('a@example.com')).not.toBe(hashSubjectEmail('b@example.com'))
  })

  it('does not leak the address', () => {
    const hash = hashSubjectEmail('person@example.com')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('person')
    expect(hash).not.toContain('@')
  })
})

describe('buildDeletionReceiptPayload', () => {
  it('never stores the address itself', () => {
    const serialized = JSON.stringify(payload())
    expect(serialized).not.toContain('Person@Example.com')
    expect(serialized).not.toContain('person@example.com')
  })

  it('marks the receipt verified only when nothing is left behind', () => {
    expect(payload().outcome.verified).toBe(true)
    expect(payload({ residualTables: ['vault_data'] }).outcome.verified).toBe(false)
  })

  it('sorts tables so the same deletion always produces the same bytes', () => {
    const a = payload({
      tables: [
        { table: 'vault_data', behaviour: 'cascade', affected: 0 },
        { table: 'audit_logs', behaviour: 'cascade', affected: 0 },
      ],
    })
    const b = payload({
      tables: [
        { table: 'audit_logs', behaviour: 'cascade', affected: 0 },
        { table: 'vault_data', behaviour: 'cascade', affected: 0 },
      ],
    })
    expect(canonicalDeletionReceipt(a)).toBe(canonicalDeletionReceipt(b))
  })

  it('carries the version and the residual disclosures', () => {
    const built = payload()
    expect(built.version).toBe(DELETION_RECEIPT_VERSION)
    expect(built.residualDisclosures.some((entry) => entry.holder === 'Stripe')).toBe(true)
  })
})

describe('deletion receipt signatures', () => {
  it('round-trips', () => {
    const built = payload()
    const signature = signDeletionReceipt(key.encryptedPrivateKey, key.privateKeyIv, built)
    expect(verifyDeletionReceipt(key.publicKey, built, signature)).toBe(true)
  })

  it('fails when a single field is altered', () => {
    const built = payload()
    const signature = signDeletionReceipt(key.encryptedPrivateKey, key.privateKeyIv, built)
    const tampered = {
      ...built,
      outcome: { ...built.outcome, verified: false },
    }
    expect(verifyDeletionReceipt(key.publicKey, tampered, signature)).toBe(false)
  })

  it('fails against a different key', () => {
    const built = payload()
    const signature = signDeletionReceipt(key.encryptedPrivateKey, key.privateKeyIv, built)
    const other = generateIssuerKey()
    expect(verifyDeletionReceipt(other.publicKey, built, signature)).toBe(false)
  })

  it('verifies regardless of key order in the re-serialized payload', () => {
    const built = payload()
    const signature = signDeletionReceipt(key.encryptedPrivateKey, key.privateKeyIv, built)
    const entries = Object.entries(built).reverse()
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(entries)))
    expect(verifyDeletionReceipt(key.publicKey, reordered, signature)).toBe(true)
  })
})
