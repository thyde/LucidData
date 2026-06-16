import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { VaultData, InsertVaultData, UpdateVaultData } from '@/types/database.types'

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
  const entry = await vaultRepo.createVaultEntry({ user_id: userId, ...payload } as InsertVaultData)
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
  await vaultRepo.deleteVaultEntry(id, userId)
  await createAuditEntry({
    userId,
    eventType: 'data_deleted',
    action: `Deleted vault entry: ${entry?.label ?? id}`,
    vaultDataId: id,
  })
}
