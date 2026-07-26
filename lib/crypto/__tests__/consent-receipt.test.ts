import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import {
  buildConsentReceiptPayload,
  canonicalConsentReceipt,
  signConsentReceipt,
  verifyConsentReceipt,
  permittedActionsFor,
  accessModeFor,
  onwardUseLimitFor,
  CONSENT_RECEIPT_VERSION,
  CONSENT_POLICY_VERSION,
} from '@/lib/crypto/consent-receipt'
import { generateIssuerKey } from '@/lib/crypto/credential-signing'

// The receipt signer reuses the issuer key wrapping, so a 32-byte secret must be
// present before any key is generated.
beforeAll(() => {
  process.env.ISSUER_KEY_SECRET = crypto.randomBytes(32).toString('base64')
})

const BASE = {
  receiptId: '11111111-1111-4111-8111-111111111111',
  event: 'granted' as const,
  issuedAt: '2026-07-25T10:00:00.000Z',
  consentId: '22222222-2222-4222-8222-222222222222',
  subjectId: '33333333-3333-4333-8333-333333333333',
  recipient: { id: 'acme', name: 'Acme Health', email: 'privacy@acme.example' },
  dataCategories: ['medical', 'identity'],
  purpose: 'Confirm eligibility for a clinical trial',
  accessLevel: 'read',
  startDate: '2026-07-25T00:00:00.000Z',
  endDate: '2026-10-25T00:00:00.000Z',
  termsVersion: 'v1',
  revoked: false,
}

describe('permittedActionsFor', () => {
  it('maps each access level to plain actions', () => {
    expect(permittedActionsFor('read')).toEqual(['read'])
    expect(permittedActionsFor('export')).toEqual(['read', 'export'])
    expect(permittedActionsFor('verify')).toEqual(['verify'])
  })
})

describe('accessModeFor', () => {
  it('treats export as a one-time delivery and everything else as continuous', () => {
    expect(accessModeFor('export')).toBe('one_time')
    expect(accessModeFor('read')).toBe('continuous')
    expect(accessModeFor('verify')).toBe('continuous')
  })
})

describe('onwardUseLimitFor', () => {
  it('states that a delivered copy cannot be recalled for exports', () => {
    expect(onwardUseLimitFor('export')).toContain('cannot be recalled')
  })

  it('states that access ends on revocation for live access', () => {
    expect(onwardUseLimitFor('read')).toContain('access ends')
  })
})

describe('buildConsentReceiptPayload', () => {
  it('carries every field a receipt must state', () => {
    const payload = buildConsentReceiptPayload(BASE)

    expect(payload.receiptId).toBe(BASE.receiptId)
    expect(payload.version).toBe(CONSENT_RECEIPT_VERSION)
    expect(payload.policyVersion).toBe(CONSENT_POLICY_VERSION)
    expect(payload.event).toBe('granted')
    expect(payload.issuedAt).toBe(BASE.issuedAt)
    expect(payload.supersedesReceiptId).toBeNull()

    expect(payload.consent.consentId).toBe(BASE.consentId)
    expect(payload.consent.subjectId).toBe(BASE.subjectId)
    expect(payload.consent.recipient).toEqual(BASE.recipient)
    expect(payload.consent.dataCategories).toEqual(['identity', 'medical'])
    expect(payload.consent.purpose).toBe(BASE.purpose)
    expect(payload.consent.permittedActions).toEqual(['read'])
    expect(payload.consent.accessMode).toBe('continuous')
    expect(payload.consent.legalBasis).toBe('consent')
    expect(payload.consent.startDate).toBe(BASE.startDate)
    expect(payload.consent.endDate).toBe(BASE.endDate)
    expect(payload.consent.onwardUseLimit).toBeTruthy()
    expect(payload.consent.compensation).toBeNull()
    expect(payload.consent.termsVersion).toBe('v1')
    expect(payload.consent.revoked).toBe(false)
    expect(payload.consent.revokedAt).toBeNull()
  })

  it('contains no vault content fields', () => {
    const serialized = canonicalConsentReceipt(buildConsentReceiptPayload(BASE))
    for (const forbidden of [
      'client_ciphertext',
      'encrypted_dek',
      'dek_salt',
      'ciphertext',
      'plaintext',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('records the receipt it supersedes', () => {
    const payload = buildConsentReceiptPayload({
      ...BASE,
      event: 'revoked',
      supersedesReceiptId: BASE.receiptId,
      revoked: true,
      revokedAt: '2026-08-01T00:00:00.000Z',
    })
    expect(payload.supersedesReceiptId).toBe(BASE.receiptId)
    expect(payload.consent.revoked).toBe(true)
    expect(payload.consent.revokedAt).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('canonicalConsentReceipt', () => {
  it('is stable across field ordering, so a signature survives re-serialization', () => {
    const payload = buildConsentReceiptPayload(BASE)
    const reordered = JSON.parse(
      JSON.stringify({
        consent: payload.consent,
        version: payload.version,
        receiptId: payload.receiptId,
        supersedesReceiptId: payload.supersedesReceiptId,
        issuedAt: payload.issuedAt,
        event: payload.event,
        policyVersion: payload.policyVersion,
      })
    )
    expect(canonicalConsentReceipt(reordered)).toBe(canonicalConsentReceipt(payload))
  })
})

describe('signConsentReceipt / verifyConsentReceipt', () => {
  it('round-trips a signature over the canonical payload', () => {
    const key = generateIssuerKey()
    const payload = buildConsentReceiptPayload(BASE)
    const signature = signConsentReceipt(
      key.encryptedPrivateKey,
      key.privateKeyIv,
      payload
    )
    expect(verifyConsentReceipt(key.publicKey, payload, signature)).toBe(true)
  })

  it('still verifies when the payload is re-parsed with different key order', () => {
    const key = generateIssuerKey()
    const payload = buildConsentReceiptPayload(BASE)
    const signature = signConsentReceipt(
      key.encryptedPrivateKey,
      key.privateKeyIv,
      payload
    )
    const roundTripped = JSON.parse(JSON.stringify(payload))
    expect(verifyConsentReceipt(key.publicKey, roundTripped, signature)).toBe(true)
  })

  it('fails when a single field is altered', () => {
    const key = generateIssuerKey()
    const payload = buildConsentReceiptPayload(BASE)
    const signature = signConsentReceipt(
      key.encryptedPrivateKey,
      key.privateKeyIv,
      payload
    )

    const tampered = JSON.parse(JSON.stringify(payload))
    tampered.consent.purpose = 'Something the subject never agreed to'
    expect(verifyConsentReceipt(key.publicKey, tampered, signature)).toBe(false)
  })

  it('fails when the end date is extended after signing', () => {
    const key = generateIssuerKey()
    const payload = buildConsentReceiptPayload(BASE)
    const signature = signConsentReceipt(
      key.encryptedPrivateKey,
      key.privateKeyIv,
      payload
    )

    const tampered = JSON.parse(JSON.stringify(payload))
    tampered.consent.endDate = '2030-01-01T00:00:00.000Z'
    expect(verifyConsentReceipt(key.publicKey, tampered, signature)).toBe(false)
  })

  it('fails against a different signing key', () => {
    const key = generateIssuerKey()
    const other = generateIssuerKey()
    const payload = buildConsentReceiptPayload(BASE)
    const signature = signConsentReceipt(
      key.encryptedPrivateKey,
      key.privateKeyIv,
      payload
    )
    expect(verifyConsentReceipt(other.publicKey, payload, signature)).toBe(false)
  })
})
