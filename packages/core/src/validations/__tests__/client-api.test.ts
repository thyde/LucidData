import { describe, expect, it } from 'vitest'
import { vaultEntryBatchCreateSchema, vaultEntryCreateSchema } from '../client-api'

const ENTRY = { label: 'Morning run', client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }

describe('client API vault entries', () => {
  it('refuses a record identifier without the provider that issued it', () => {
    const result = vaultEntryCreateSchema.safeParse({ ...ENTRY, source_record_id: 'abc123' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['source_record_id'],
      message: 'A record identifier needs the provider that issued it',
    })
  })

  it('accepts a record identifier with its provider, and an entry with neither', () => {
    expect(
      vaultEntryCreateSchema.safeParse({ ...ENTRY, source_provider: 'strava', source_record_id: 'abc123' })
        .success
    ).toBe(true)
    expect(vaultEntryCreateSchema.safeParse(ENTRY).success).toBe(true)
  })

  it('refuses a whole batch when one entry breaks the rule, and says which', () => {
    const result = vaultEntryBatchCreateSchema.safeParse({
      entries: [ENTRY, { ...ENTRY, source_record_id: 'abc123' }],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['entries', 1, 'source_record_id'])
  })

  it('requires the whole encrypted envelope', () => {
    const result = vaultEntryCreateSchema.safeParse({ label: 'x', client_ciphertext: 'c' })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['encrypted_dek', 'dek_salt'])
    )
  })
})
