import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/vault.repository', () => ({
  findVaultById: vi.fn(),
  deleteVaultEntry: vi.fn(),
  createVaultEntry: vi.fn(),
  createVaultEntries: vi.fn(),
  findStoredSourceRecordIds: vi.fn(),
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

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { HIGH: 'high' },
  errorLogger: { log: vi.fn() },
}))

import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertHealthDataConsent } from '@/lib/services/legal.service'
import { assertRecoveryReadyForFirstWrite } from '@/lib/services/recovery-factor.service'
import { UserFacingError } from '@/lib/actions/action-result'
import { HEALTH_CONSENT_REQUIRED } from '@/lib/constants/legal'
import { createVaultData, createVaultDataBatch, deleteVaultData, updateVaultData } from '@/lib/services/vault.service'
import { ALREADY_STORED } from '@luciddata/core/validations/provenance'
import type { VaultData } from '@/types/database.types'

const envelope = { client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }

describe('health data needs consent before it is stored (LD-110)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue({ id: 'v1', label: 'x' } as VaultData)
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

    await expect(deleteVaultData('missing', entry.user_id)).rejects.toMatchObject({
      message: 'Vault entry not found',
      code: 'not_found',
    })
    expect(vaultRepo.deleteVaultEntry).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('updateVaultData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(vaultRepo.updateVaultEntry).mockResolvedValue(entry)
  })

  it('records the update and nothing else', async () => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(entry)

    await updateVaultData(entry.id, entry.user_id, { label: 'Private profile' })

    expect(createAuditEntry).toHaveBeenCalledTimes(1)
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'data_updated', vaultDataId: entry.id })
    )
  })

  it('refuses an entry the user cannot access before writing or auditing anything', async () => {
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(null)

    await expect(
      updateVaultData('missing', entry.user_id, { category: 'health' })
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(vaultRepo.findVaultById).toHaveBeenCalledWith('missing', entry.user_id)
    expect(assertHealthDataConsent).not.toHaveBeenCalled()
    expect(vaultRepo.updateVaultEntry).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('a vault write sets only the columns it should', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertHealthDataConsent).mockResolvedValue(undefined)
    vi.mocked(vaultRepo.findVaultById).mockResolvedValue(entry)
    vi.mocked(vaultRepo.createVaultEntry).mockResolvedValue(entry)
    vi.mocked(vaultRepo.updateVaultEntry).mockResolvedValue(entry)
  })

  it('stores an entry for the session user, whatever the payload says', async () => {
    await createVaultData('user-1', {
      label: 'Private profile',
      ...envelope,
      user_id: 'user-2',
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2000-01-01T00:00:00Z',
    } as Parameters<typeof createVaultData>[1])

    const row = vi.mocked(vaultRepo.createVaultEntry).mock.calls[0][0] as Record<string, unknown>
    expect(row.user_id).toBe('user-1')
    expect(row).not.toHaveProperty('id')
    expect(row).not.toHaveProperty('created_at')
  })

  it('changes only the fields an edit can change', async () => {
    await updateVaultData(entry.id, 'user-1', {
      label: 'Renamed',
      schema_type: 'custom',
      source_provider: 'strava',
      user_id: 'user-2',
    } as Parameters<typeof updateVaultData>[2])

    expect(vi.mocked(vaultRepo.updateVaultEntry).mock.calls[0][2]).toEqual({ label: 'Renamed' })
  })

  it('reports a record the vault already holds from the same source', async () => {
    vi.mocked(vaultRepo.createVaultEntry).mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "idx_vault_source_record_unique"',
    })

    const write = createVaultData('user-1', {
      label: 'Workout',
      category: 'health',
      schema_type: 'fitness_activity',
      source_provider: 'strava',
      source_record_id: '111',
      ...envelope,
    })
    await expect(write).rejects.toBeInstanceOf(UserFacingError)
    await expect(write).rejects.toMatchObject({ code: ALREADY_STORED })
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('passes any other database failure through untouched', async () => {
    const failure = { code: '23505', message: 'duplicate key value violates unique constraint "vault_data_pkey"' }
    vi.mocked(vaultRepo.createVaultEntry).mockRejectedValue(failure)

    await expect(createVaultData('user-1', { label: 'x', ...envelope })).rejects.toBe(failure)
  })
})

describe('createVaultDataBatch', () => {
  const entry = (n: number, extra: Record<string, unknown> = {}) => ({
    label: `Entry ${n}`,
    category: 'personal',
    schema_type: 'custom',
    client_ciphertext: `cipher-${n}`,
    encrypted_dek: 'd',
    dek_salt: 's',
    ...extra,
  })
  const workout = (n: number) =>
    entry(n, {
      category: 'health',
      schema_type: 'fitness_activity',
      source_provider: 'apple-health',
      source_record_id: `fitness_activity:2026-10-0${n}T07:00:00Z`,
    })
  const echo = (rows: Record<string, unknown>[]) =>
    rows.map((row, i) => ({ ...row, id: `id-${i}-${String(row.client_ciphertext)}` }) as unknown as VaultData)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertRecoveryReadyForFirstWrite).mockResolvedValue(undefined)
    vi.mocked(assertHealthDataConsent).mockResolvedValue(undefined)
    vi.mocked(vaultRepo.findStoredSourceRecordIds).mockResolvedValue(new Set())
    vi.mocked(vaultRepo.createVaultEntries).mockImplementation(async (rows) =>
      // Returned in a different order, as nothing promises the database will not.
      echo(rows as Record<string, unknown>[]).reverse()
    )
  })

  it('stores each entry, answers each by its own index, and writes one audit entry', async () => {
    const results = await createVaultDataBatch('user-1', [entry(1), entry(2), entry(3)])

    expect(results.map((result) => ('data' in result ? result.data.client_ciphertext : result.code))).toEqual([
      'cipher-1',
      'cipher-2',
      'cipher-3',
    ])
    expect(vaultRepo.createVaultEntries).toHaveBeenCalledTimes(1)
    const rows = vi.mocked(vaultRepo.createVaultEntries).mock.calls[0][0] as Record<string, unknown>[]
    expect(rows.every((row) => row.user_id === 'user-1')).toBe(true)
    expect(createAuditEntry).toHaveBeenCalledTimes(1)
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'data_created', action: 'Imported 3 vault entries' })
    )
  })

  it('answers a record the vault holds, or that repeats in the batch, without writing it', async () => {
    vi.mocked(vaultRepo.findStoredSourceRecordIds).mockResolvedValue(new Set(['fitness_activity:2026-10-01T07:00:00Z']))

    const results = await createVaultDataBatch('user-1', [workout(1), workout(2), workout(2)])

    expect(results.map((result) => ('code' in result ? result.code : 'stored'))).toEqual([
      ALREADY_STORED,
      'stored',
      ALREADY_STORED,
    ])
    expect((vi.mocked(vaultRepo.createVaultEntries).mock.calls[0][0] as unknown[]).length).toBe(1)
  })

  it('refuses health entries without consent, and stores the rest', async () => {
    vi.mocked(assertHealthDataConsent).mockRejectedValue(new UserFacingError('consent needed', HEALTH_CONSENT_REQUIRED))

    const results = await createVaultDataBatch('user-1', [entry(1), workout(2)])

    expect('data' in results[0]).toBe(true)
    expect(results[1]).toMatchObject({ index: 1, code: HEALTH_CONSENT_REQUIRED })
  })

  it('refuses the whole batch when the vault needs recovery set up first', async () => {
    vi.mocked(assertRecoveryReadyForFirstWrite).mockRejectedValue(new UserFacingError('Set up recovery', 'recovery_required'))

    const results = await createVaultDataBatch('user-1', [entry(1), entry(2)])

    expect(results.map((result) => ('code' in result ? result.code : 'stored'))).toEqual([
      'recovery_required',
      'recovery_required',
    ])
    expect(vaultRepo.createVaultEntries).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('stores one at a time when the insert is refused as a whole, so each entry gets its own answer', async () => {
    vi.mocked(vaultRepo.createVaultEntries).mockRejectedValue({ code: '23505', message: 'duplicate key' })
    vi.mocked(vaultRepo.createVaultEntry)
      .mockResolvedValueOnce({ id: 'v1', client_ciphertext: 'cipher-1' } as VaultData)
      .mockRejectedValueOnce({
        code: '23505',
        message: 'duplicate key value violates unique constraint "idx_vault_source_record_unique"',
      })
      .mockRejectedValueOnce(new Error('connection reset'))

    const results = await createVaultDataBatch('user-1', [entry(1), workout(2), entry(3)])

    expect(results.map((result) => ('code' in result ? result.code : 'stored'))).toEqual([
      'stored',
      ALREADY_STORED,
      'internal',
    ])
    expect(createAuditEntry).toHaveBeenCalledWith(expect.objectContaining({ action: 'Imported 1 vault entry' }))
  })
})
