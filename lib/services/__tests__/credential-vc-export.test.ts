import { describe, it, expect } from 'vitest'
import { toW3cVerifiableCredential } from '@/lib/services/credential.service'
import type { IssuedCredential } from '@/types/database.types'

const baseCredential: IssuedCredential = {
  id: '11111111-1111-1111-1111-111111111111',
  organization_id: '22222222-2222-2222-2222-222222222222',
  subject_user_id: '33333333-3333-3333-3333-333333333333',
  subject_email: 'grad@example.com',
  schema_type: 'education',
  label: 'BSc Computer Science',
  claims: { institution: 'Example University', degree: 'bachelor', graduation_year: 2025 },
  signed_payload: {},
  signature: 'sig_abc',
  key_id: 'key_123',
  issued_at: '2026-06-16T00:00:00.000Z',
  expires_at: null,
  status: 'active',
  revocation_reason: null,
  claimed_at: '2026-06-16T01:00:00.000Z',
  vault_data_id: null,
  created_at: '2026-06-16T00:00:00.000Z',
}

describe('toW3cVerifiableCredential', () => {
  it('maps a credential to a W3C VC-shaped document', () => {
    const vc = toW3cVerifiableCredential(baseCredential, 'Example University', 'example.edu')

    expect(vc['@context']).toContain('https://www.w3.org/ns/credentials/v2')
    expect(vc.id).toBe('urn:uuid:11111111-1111-1111-1111-111111111111')
    expect(vc.type).toEqual(['VerifiableCredential', 'education'])
    expect(vc.issuer).toEqual({ id: 'did:web:example.edu', name: 'Example University' })
    expect(vc.validFrom).toBe('2026-06-16T00:00:00.000Z')
    expect(vc).not.toHaveProperty('validUntil')

    const subject = vc.credentialSubject as Record<string, unknown>
    expect(subject.email).toBe('grad@example.com')
    expect(subject.degree).toBe('bachelor')

    const proof = vc.proof as Record<string, unknown>
    expect(proof.type).toBe('Ed25519Signature2020')
    expect(proof.proofValue).toBe('sig_abc')
    expect(proof.verificationMethod).toBe('key_123')
  })

  it('falls back to a urn issuer id when no domain is set, and includes validUntil', () => {
    const vc = toW3cVerifiableCredential(
      { ...baseCredential, expires_at: '2030-01-01T00:00:00.000Z' },
      'Example University',
      null
    )
    expect((vc.issuer as Record<string, unknown>).id).toBe('urn:lucid:org:22222222-2222-2222-2222-222222222222')
    expect(vc.validUntil).toBe('2030-01-01T00:00:00.000Z')
  })

  it('reflects revocation status in credentialStatus', () => {
    const vc = toW3cVerifiableCredential(
      { ...baseCredential, status: 'revoked' },
      'Example University',
      'example.edu'
    )
    expect((vc.credentialStatus as Record<string, unknown>).status).toBe('revoked')
  })
})
