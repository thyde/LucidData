import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import crypto from 'crypto'

const keyById = vi.fn()
const createAuditEntry = vi.fn()

vi.mock('@/lib/services/issuer-key.service', () => ({
  getIssuerKeyById: (...a: unknown[]) => keyById(...a),
  signCredentialForOrg: vi.fn(),
}))

vi.mock('@/lib/services/billing.service', () => ({
  recordUsage: vi.fn(),
  assertIssuanceQuota: vi.fn(),
}))

vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({}) }),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

const { generateIssuerKey, signWithPrivateKey } = await import(
  '@/lib/crypto/credential-signing'
)
const { verifyIssuedCredential } = await import('@/lib/services/credential.service')

let key: ReturnType<typeof generateIssuerKey>

beforeAll(() => {
  process.env.ISSUER_KEY_SECRET = crypto.randomBytes(32).toString('base64')
  key = generateIssuerKey()
})

const ORG = 'org-1'

function credential(overrides: Record<string, unknown> = {}) {
  const payload = { id: 'cred-1', claims: { degree: 'BSc' } }
  return {
    id: 'cred-1',
    organization_id: ORG,
    key_id: key.keyId,
    signed_payload: payload,
    signature: signWithPrivateKey(key.encryptedPrivateKey, key.privateKeyIv, payload),
    status: 'active',
    issued_at: '2026-06-01T00:00:00.000Z',
    expires_at: null,
    ...overrides,
  } as unknown as Parameters<typeof verifyIssuedCredential>[0]
}

function storedKey(overrides: Record<string, unknown> = {}) {
  return {
    key_id: key.keyId,
    organization_id: ORG,
    public_key: key.publicKey,
    status: 'active',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: null,
    compromised_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  keyById.mockReset().mockResolvedValue(storedKey())
  createAuditEntry.mockReset().mockResolvedValue(undefined)
})

describe('verifyIssuedCredential', () => {
  it('verifies a credential against the key that signed it', async () => {
    const result = await verifyIssuedCredential(credential())
    expect(result.valid).toBe(true)
    expect(result.reasons).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('selects the key by identifier, so a retired key still verifies history', async () => {
    keyById.mockResolvedValue(
      storedKey({ status: 'retired', valid_until: '2026-07-01T00:00:00.000Z' })
    )

    const result = await verifyIssuedCredential(credential())
    expect(keyById).toHaveBeenCalledWith(key.keyId)
    expect(result.valid).toBe(true)
  })

  it('fails a credential signed after the key was compromised', async () => {
    keyById.mockResolvedValue(
      storedKey({ status: 'compromised', compromised_at: '2026-05-01T00:00:00.000Z' })
    )

    const result = await verifyIssuedCredential(
      credential({ issued_at: '2026-06-01T00:00:00.000Z' })
    )
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/compromised at the time of signing/i)
  })

  it('keeps a pre-compromise credential valid but warns to re-check', async () => {
    keyById.mockResolvedValue(
      storedKey({ status: 'compromised', compromised_at: '2026-07-01T00:00:00.000Z' })
    )

    const result = await verifyIssuedCredential(
      credential({ issued_at: '2026-06-01T00:00:00.000Z' })
    )
    expect(result.valid).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/later reported compromised/i)
  })

  it('fails closed when the signing key is unknown', async () => {
    keyById.mockResolvedValue(null)
    const result = await verifyIssuedCredential(credential())
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/not known/i)
  })

  it('rejects a key belonging to a different organization', async () => {
    keyById.mockResolvedValue(storedKey({ organization_id: 'org-other' }))
    const result = await verifyIssuedCredential(credential())
    expect(result.valid).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const tampered = credential()
    ;(tampered.signed_payload as { claims: Record<string, unknown> }).claims.degree = 'PhD'
    const result = await verifyIssuedCredential(tampered)
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/Signature does not match/i)
  })

  it('reports revoked and expired credentials', async () => {
    const revoked = await verifyIssuedCredential(credential({ status: 'revoked' }))
    expect(revoked.valid).toBe(false)

    const expired = await verifyIssuedCredential(
      credential({ expires_at: '2020-01-01T00:00:00.000Z' })
    )
    expect(expired.valid).toBe(false)
  })
})
