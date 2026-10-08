import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertRecoveryReadyForFirstWrite } from '@/lib/services/recovery-factor.service'
import { parseProvenance } from '@luciddata/core/validations/provenance'
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

  const entry = await vaultRepo.createVaultEntry({
    user_id: userId,
    ...payload,
    ...provenance,
  } as InsertVaultData)
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

  const updated = await vaultRepo.updateVaultEntry(id, userId, payload as UpdateVaultData)
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
