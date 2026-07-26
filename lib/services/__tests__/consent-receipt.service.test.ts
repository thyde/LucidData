import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import crypto from 'crypto'

const insertReceipt = vi.fn()
const findLatestReceiptForConsent = vi.fn()
const findReceiptById = vi.fn()
const getOrCreateActivePlatformKey = vi.fn()
const getPlatformKeyById = vi.fn()
const createAuditEntry = vi.fn()

vi.mock('@/lib/repositories/consent-receipt.repository', () => ({
  insertReceipt: (...a: unknown[]) => insertReceipt(...a),
  findLatestReceiptForConsent: (...a: unknown[]) => findLatestReceiptForConsent(...a),
  findReceiptById: (...a: unknown[]) => findReceiptById(...a),
  findReceiptsForConsent: vi.fn(),
  findReceiptsForUser: vi.fn(),
}))

vi.mock('@/lib/services/platform-key.service', () => ({
  getOrCreateActivePlatformKey: (...a: unknown[]) => getOrCreateActivePlatformKey(...a),
  getPlatformKeyById: (...a: unknown[]) => getPlatformKeyById(...a),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

const { generateIssuerKey } = await import('@/lib/crypto/credential-signing')
const { issueConsentReceipt, verifyConsentReceiptById } = await import(
  '@/lib/services/consent-receipt.service'
)

let key: ReturnType<typeof generateIssuerKey>

beforeAll(() => {
  process.env.ISSUER_KEY_SECRET = crypto.randomBytes(32).toString('base64')
  key = generateIssuerKey()
})

const consent = {
  id: 'consent-1',
  user_id: 'user-1',
  vault_data_id: null,
  granted_to: 'acme',
  granted_to_name: 'Acme Health',
  granted_to_email: 'privacy@acme.example',
  access_level: 'read',
  purpose: 'Eligibility check',
  start_date: '2026-07-25T00:00:00.000Z',
  end_date: '2026-10-25T00:00:00.000Z',
  revoked: false,
  revoked_at: null,
  revoked_reason: null,
  consent_type: 'explicit',
  ip_address: null,
  user_agent: null,
  terms_version: 'v1',
  data_category: 'medical',
  created_at: '2026-07-25T00:00:00.000Z',
  updated_at: '2026-07-25T00:00:00.000Z',
  expired_at: null,
} as unknown as Parameters<typeof issueConsentReceipt>[0]

beforeEach(() => {
  insertReceipt.mockReset().mockImplementation((row) => Promise.resolve(row))
  findLatestReceiptForConsent.mockReset().mockResolvedValue(null)
  findReceiptById.mockReset().mockResolvedValue(null)
  getOrCreateActivePlatformKey.mockReset().mockResolvedValue({
    key_id: key.keyId,
    public_key: key.publicKey,
    encrypted_private_key: key.encryptedPrivateKey,
    private_key_iv: key.privateKeyIv,
  })
  getPlatformKeyById.mockReset().mockResolvedValue({
    key_id: key.keyId,
    public_key: key.publicKey,
  })
  createAuditEntry.mockReset().mockResolvedValue(undefined)
})

describe('issueConsentReceipt', () => {
  it('signs a granted receipt and writes its hash into the audit chain', async () => {
    const { receipt, payload } = await issueConsentReceipt(consent, 'granted')

    expect(receipt.event).toBe('granted')
    expect(receipt.signature).toEqual(expect.any(String))
    expect(receipt.key_id).toBe(key.keyId)
    expect(payload.consent.purpose).toBe('Eligibility check')

    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'consent_receipt_issued',
        consentId: 'consent-1',
        metadata: expect.objectContaining({ receipt_id: receipt.id, event: 'granted' }),
      })
    )
  })

  it('chains a revocation receipt to the previous one instead of mutating it', async () => {
    findLatestReceiptForConsent.mockResolvedValue({ id: 'receipt-prior' })

    const { receipt, payload } = await issueConsentReceipt(
      { ...consent, revoked: true, revoked_at: '2026-08-01T00:00:00.000Z' } as typeof consent,
      'revoked'
    )

    expect(receipt.supersedes_receipt_id).toBe('receipt-prior')
    expect(payload.supersedesReceiptId).toBe('receipt-prior')
    expect(payload.consent.revoked).toBe(true)
    // Exactly one insert: the prior receipt is untouched.
    expect(insertReceipt).toHaveBeenCalledTimes(1)
  })

  it('records no vault content on the receipt row', async () => {
    const { receipt } = await issueConsentReceipt(consent, 'granted')
    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain('client_ciphertext')
    expect(serialized).not.toContain('encrypted_dek')
    expect(serialized).not.toContain('dek_salt')
  })
})

describe('verifyConsentReceiptById', () => {
  it('reports not found for an unknown receipt', async () => {
    await expect(verifyConsentReceiptById('missing')).resolves.toEqual({ found: false })
  })

  it('verifies an untouched receipt', async () => {
    const { receipt } = await issueConsentReceipt(consent, 'granted')
    findReceiptById.mockResolvedValue(receipt)

    const result = await verifyConsentReceiptById(receipt.id as string)
    expect(result).toMatchObject({ found: true, valid: true })
  })

  it('fails verification when a stored byte is altered', async () => {
    const { receipt } = await issueConsentReceipt(consent, 'granted')
    const tampered = JSON.parse(JSON.stringify(receipt))
    tampered.payload.consent.endDate = '2099-01-01T00:00:00.000Z'
    findReceiptById.mockResolvedValue(tampered)

    const result = await verifyConsentReceiptById(receipt.id as string)
    expect(result).toMatchObject({ found: true, valid: false })
  })

  it('fails closed when the signing key is unknown', async () => {
    const { receipt } = await issueConsentReceipt(consent, 'granted')
    findReceiptById.mockResolvedValue(receipt)
    getPlatformKeyById.mockResolvedValue(null)

    const result = await verifyConsentReceiptById(receipt.id as string)
    expect(result).toMatchObject({ found: true, valid: false })
  })
})
