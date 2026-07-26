import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/vault.repository', () => ({
  findVaultById: vi.fn(),
  deleteVaultEntry: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: vi.fn(),
}))

import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { deleteVaultData } from '@/lib/services/vault.service'
import type { VaultData } from '@/types/database.types'

const entry = {
  id: 'vault-1',
  user_id: 'user-1',
  label: 'Private profile',
} as VaultData

describe('deleteVaultData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(entry)
  })

  it('records the deleted id as metadata without a dangling foreign key', async () => {
    await deleteVaultData(entry.id, entry.user_id)

    expect(vaultRepo.deleteVaultEntry).toHaveBeenCalledWith(entry.id, entry.user_id)
    expect(createAuditEntry).toHaveBeenCalledWith({
      userId: entry.user_id,
      eventType: 'data_deleted',
      action: 'Deleted vault entry: Private profile',
      metadata: { deleted_vault_data_id: entry.id },
    })
  })

  it('does not delete or audit an entry the user cannot access', async () => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(null)

    await expect(deleteVaultData('missing', entry.user_id)).rejects.toThrow('Vault entry not found')
    expect(vaultRepo.deleteVaultEntry).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})