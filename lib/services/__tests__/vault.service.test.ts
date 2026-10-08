import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/vault.repository', () => ({
  findVaultById: vi.fn(),
  deleteVaultEntry: vi.fn(),
  createVaultEntry: vi.fn(),
  updateVaultEntry: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: vi.fn(),
}))

vi.mock('@/lib/services/recovery-factor.service', () => ({
  assertRecoveryReadyForFirstWrite: vi.fn(),
}))

vi.mock('@/lib/services/legal.service', () => ({
  assertHealthDataConsent: vi.fn(),
}))

import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertHealthDataConsent } from '@/lib/services/legal.service'
import { UserFacingError } from '@/lib/actions/action-result'
import { HEALTH_CONSENT_REQUIRED } from '@/lib/constants/legal'
import { createVaultData, deleteVaultData, updateVaultData } from '@/lib/services/vault.service'
import type { VaultData } from '@/types/database.types'

const envelope = { client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }

describe('health data needs consent before it is stored (LD-110)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(vaultRepo.createVaultEntry).mockResolvedValue({ id: 'v1', label: 'x' } as VaultData)
    vi.mocked(vaultRepo.updateVaultEntry).mockResolvedValue({ id: 'v1', label: 'x' } as VaultData)
    vi.mocked(assertHealthDataConsent).mockRejectedValue(
      new UserFacingError('consent needed', HEALTH_CONSENT_REQUIRED)
    )
  })

  it('refuses an entry filed under health', async () => {
    await expect(
      createVaultData('user-1', { label: 'Blood test', category: 'health', ...envelope })
    ).rejects.toMatchObject({ code: HEALTH_CONSENT_REQUIRED })
    expect(vaultRepo.createVaultEntry).not.toHaveBeenCalled()
  })

  it('refuses a fitness record whatever category it was given', async () => {
    await expect(
      createVaultData('user-1', {
        label: 'Morning run',
        category: 'personal',
        schema_type: 'fitness_activity',
        ...envelope,
      })
    ).rejects.toMatchObject({ code: HEALTH_CONSENT_REQUIRED })
    expect(vaultRepo.createVaultEntry).not.toHaveBeenCalled()
  })

  it('refuses moving an existing entry into health', async () => {
    await expect(updateVaultData('v1', 'user-1', { category: 'health' })).rejects.toMatchObject({
      code: HEALTH_CONSENT_REQUIRED,
    })
    expect(vaultRepo.updateVaultEntry).not.toHaveBeenCalled()
  })

  it('does not ask about entries that are not health data', async () => {
    await createVaultData('user-1', { label: 'Passport', category: 'credentials', schema_type: 'identity', ...envelope })
    await updateVaultData('v1', 'user-1', { label: 'Renamed' })
    expect(assertHealthDataConsent).not.toHaveBeenCalled()
    expect(vaultRepo.createVaultEntry).toHaveBeenCalled()
  })

  it('stores health data once consent is on record', async () => {
    vi.mocked(assertHealthDataConsent).mockResolvedValue(undefined)
    await createVaultData('user-1', { label: 'Sleep', category: 'health', ...envelope })
    expect(assertHealthDataConsent).toHaveBeenCalledWith('user-1')
    expect(vaultRepo.createVaultEntry).toHaveBeenCalled()
  })
})

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