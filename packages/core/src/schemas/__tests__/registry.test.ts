import { describe, expect, it } from 'vitest'
import { CREDENTIAL_SCHEMA_TYPES, ENTERABLE_SCHEMA_TYPES, VAULT_SCHEMA_TYPES } from '../vault-schemas'
import { REQUESTABLE_SCHEMA_TYPES } from '../../validations/credential-request'
import { vaultEntryCreateSchema } from '../../validations/client-api'

const envelope = { client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }

describe('schema types the app writes itself', () => {
  it('are not offered for manual entry or import', () => {
    expect(ENTERABLE_SCHEMA_TYPES).not.toContain('browsing_insight')
    expect(ENTERABLE_SCHEMA_TYPES).not.toContain('verifiable_credential')
    expect(ENTERABLE_SCHEMA_TYPES).toContain('custom')
    expect(ENTERABLE_SCHEMA_TYPES).toContain('sleep_session')
  })

  it('are not credentials an organization can issue or request', () => {
    expect(CREDENTIAL_SCHEMA_TYPES).not.toContain('custom')
    expect(CREDENTIAL_SCHEMA_TYPES).not.toContain('browsing_insight')
    expect(CREDENTIAL_SCHEMA_TYPES).not.toContain('verifiable_credential')
    expect(CREDENTIAL_SCHEMA_TYPES).toContain('education')
    expect(REQUESTABLE_SCHEMA_TYPES).toEqual(CREDENTIAL_SCHEMA_TYPES)
  })

  it('can still be stored, so a claimed credential can be saved from any client', () => {
    expect(VAULT_SCHEMA_TYPES.verifiable_credential.category).toBe('credentials')
    expect(
      vaultEntryCreateSchema.safeParse({
        label: 'Synthetic degree',
        category: 'credentials',
        schema_type: 'verifiable_credential',
        ...envelope,
      }).success
    ).toBe(true)
  })

  it('refuses a type the registry does not know', () => {
    expect(
      vaultEntryCreateSchema.safeParse({ label: 'x', schema_type: 'MedicalRecord', ...envelope }).success
    ).toBe(false)
  })
})
