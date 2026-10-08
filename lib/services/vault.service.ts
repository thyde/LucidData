import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertRecoveryReadyForFirstWrite } from '@/lib/services/recovery-factor.service'
import { ALREADY_STORED, parseProvenance } from '@luciddata/core/validations/provenance'
import type { VaultData, InsertVaultData, UpdateVaultData } from '@/types/database.types'
import { UserFacingError } from '@/lib/actions/action-result'
import { assertHealthDataConsent } from '@/lib/services/legal.service'
import { isHealthEntry } from '@/lib/constants/legal'

export interface CreateVaultPayload {
  label: string
  category?: string
  tags?: string[]
  schema_type?: string
  description?: string
  client_ciphertext: string
  encrypted_dek: string
  dek_salt: string
  expires_at?: string
  // LD-202 provenance. Unencrypted metadata, so it is validated rather than
  // trusted: identifiers only, never a label the provider wrote.
  source_provider?: string
  source_record_id?: string
  source_captured_at?: string
}

export interface UpdateVaultPayload {
  label?: string
  category?: string
  tags?: string[]
  description?: string
  // Note: to update encrypted data, caller must re-encrypt and provide all three fields
  client_ciphertext?: string
  encrypted_dek?: string
  dek_salt?: string
  expires_at?: string
}

// The columns each write may set. Everything else in a payload is dropped, so a
// caller cannot choose which columns are written, and the owner always comes
// from the session.
const CREATE_FIELDS = [
  'label',
  'category',
  'tags',
  'schema_type',
  'description',
  'client_ciphertext',
  'encrypted_dek',
  'dek_salt',
  'expires_at',
] as const
const UPDATE_FIELDS = [
  'label',
  'category',
  'tags',
  'description',
  'client_ciphertext',
  'encrypted_dek',
  'dek_salt',
  'expires_at',
] as const

function pick(payload: object, fields: readonly string[]): Record<string, unknown> {
  const source = payload as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const field of fields) {
    if (source[field] !== undefined) picked[field] = source[field]
  }
  return picked
}

/** The unique index on a source's record id, which makes a re-import add nothing. */
function isDuplicateSourceRecord(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  return code === '23505' && String(message ?? '').includes('idx_vault_source_record_unique')
}

export async function createVaultData(userId: string, payload: CreateVaultPayload): Promise<VaultData> {
  // LD-110: health data needs its own consent before we store any of it.
  if (isHealthEntry(payload)) await assertHealthDataConsent(userId)

  // LD-105: refuse the first write until the user has a recovery factor or has
  // explicitly accepted that their data will be unrecoverable. Existing vaults
  // are unaffected.
  await assertRecoveryReadyForFirstWrite(userId)

  // LD-202: throws before anything is written if provenance carries content.
  const provenance = parseProvenance({
    source_provider: payload.source_provider,
    source_record_id: payload.source_record_id,
    source_captured_at: payload.source_captured_at,
  })

  let entry: VaultData
  try {
    entry = await vaultRepo.createVaultEntry({
      ...pick(payload, CREATE_FIELDS),
      ...provenance,
      user_id: userId,
    } as InsertVaultData)
  } catch (error) {
    if (isDuplicateSourceRecord(error)) {
      throw new UserFacingError('This record is already in your vault', ALREADY_STORED)
    }
    throw error
  }
  await createAuditEntry({
    userId,
    eventType: 'data_created',
    action: `Created vault entry: ${entry.label}`,
    vaultDataId: entry.id,
  })
  return entry
}

export async function getUserVaultData(userId: string): Promise<VaultData[]> {
  return vaultRepo.findVaultByUserId(userId)
}

export async function getVaultDataById(id: string, userId: string): Promise<VaultData | null> {
  const entry = await vaultRepo.findVaultById(id, userId)
  if (entry) {
    await createAuditEntry({
      userId,
      eventType: 'data_accessed',
      action: `Accessed vault entry: ${entry.label}`,
      vaultDataId: entry.id,
    })
  }
  return entry
}

export async function updateVaultData(id: string, userId: string, payload: UpdateVaultPayload): Promise<VaultData> {
  // Looked up through the repository, not getVaultDataById, which would record
  // an access the person did not make.
  if (!(await vaultRepo.findVaultById(id, userId))) {
    throw new UserFacingError('Vault entry not found', 'not_found')
  }

  // LD-110: filing an entry under health, or changing a health entry, is
  // storing health data, so it needs the same consent as creating one.
  if (isHealthEntry(payload)) await assertHealthDataConsent(userId)

  const updated = await vaultRepo.updateVaultEntry(
    id,
    userId,
    pick(payload, UPDATE_FIELDS) as UpdateVaultData
  )
  await createAuditEntry({
    userId,
    eventType: 'data_updated',
    action: `Updated vault entry: ${updated.label}`,
    vaultDataId: updated.id,
  })
  return updated
}

export async function deleteVaultData(id: string, userId: string): Promise<void> {
  const entry = await vaultRepo.findVaultById(id, userId)
  if (!entry) throw new UserFacingError('Vault entry not found', 'not_found')

  await vaultRepo.deleteVaultEntry(id, userId)
  await createAuditEntry({
    userId,
    eventType: 'data_deleted',
    action: `Deleted vault entry: ${entry.label}`,
    metadata: { deleted_vault_data_id: id },
  })
}
