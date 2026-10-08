import { describe, expect, it } from 'vitest'
import { MAX_TAG_LENGTH, MAX_TAGS, vaultDataSchema, vaultTagsSchema } from '../vault'
import { vaultEntryCreateSchema } from '../client-api'

const envelope = { client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }

describe('vault form limits', () => {
  it('refuse the tags the server refuses, so a refusal never reaches it', () => {
    const cases: [string[], boolean][] = [
      [Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`), true],
      [Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag${i}`), false],
      [['x'.repeat(MAX_TAG_LENGTH)], true],
      [['x'.repeat(MAX_TAG_LENGTH + 1)], false],
    ]
    for (const [tags, accepted] of cases) {
      expect(vaultTagsSchema.safeParse(tags).success).toBe(accepted)
      expect(vaultEntryCreateSchema.safeParse({ label: 'x', tags, ...envelope }).success).toBe(accepted)
    }
  })

  it('treat a label of spaces as missing, as the server does', () => {
    const result = vaultDataSchema.safeParse({ label: '   ', category: 'personal', data: {} })

    expect(result.success).toBe(false)
    expect(vaultEntryCreateSchema.safeParse({ label: '   ', ...envelope }).success).toBe(false)
  })
})
