import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/monetization.repository', () => ({
  upsertField: vi.fn(),
}))

vi.mock('@/lib/repositories/vault.repository', () => ({
  findVaultById: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: vi.fn(),
}))

import * as monetizationRepo from '@/lib/repositories/monetization.repository'
import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { setFieldMonetization } from '@/lib/services/monetization.service'
import type { VaultData } from '@/types/database.types'

const userId = 'user-1'
const vaultDataId = '00000000-0000-4000-8000-000000000001'

function entry(overrides: Partial<VaultData> = {}): VaultData {
  return {
    id: vaultDataId,
    user_id: userId,
    category: 'credentials',
    schema_type: 'employment',
    ...overrides,
  } as VaultData
}

describe('setFieldMonetization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("files each toggle under the stored entry's category, not the client's", async () => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(entry())

    await setFieldMonetization(userId, {
      vault_data_id: vaultDataId,
      category: 'interests',
      fields: [{ field_key: 'role', opted_in: true }],
    })

    expect(vaultRepo.findVaultById).toHaveBeenCalledWith(vaultDataId, userId)
    expect(monetizationRepo.upsertField).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: userId, category: 'credentials', opted_in: true })
    )
    expect(createAuditEntry).toHaveBeenCalledTimes(1)
  })

  it('refuses an entry the user does not own', async () => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(null)

    await expect(
      setFieldMonetization(userId, {
        vault_data_id: vaultDataId,
        category: 'credentials',
        fields: [{ field_key: 'role', opted_in: true }],
      })
    ).rejects.toThrow('Vault entry not found')
    expect(monetizationRepo.upsertField).not.toHaveBeenCalled()
  })

  it.each([
    ['health', { category: 'health', schema_type: 'custom' }],
    ['a medical record filed under personal', { category: 'personal', schema_type: 'medical_basic' }],
    ['a tracker summary', { category: 'other', schema_type: 'browsing_insight' }],
  ])('refuses to put %s up for sale', async (_name, overrides) => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(entry(overrides as Partial<VaultData>))

    await expect(
      setFieldMonetization(userId, {
        vault_data_id: vaultDataId,
        category: 'personal',
        fields: [{ field_key: 'conditions', opted_in: true }],
      })
    ).rejects.toThrow('never for sale')
    expect(monetizationRepo.upsertField).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('still lets a restricted entry be marked private', async () => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(entry({ category: 'health' }))

    await setFieldMonetization(userId, {
      vault_data_id: vaultDataId,
      category: 'health',
      fields: [{ field_key: 'conditions', opted_in: false }],
    })

    expect(monetizationRepo.upsertField).toHaveBeenCalledWith(
      expect.objectContaining({ opted_in: false, category: 'health' })
    )
  })
})
