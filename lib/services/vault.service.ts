import * as vaultRepo from '@/lib/repositories/vault.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertRecoveryReadyForFirstWrite } from '@/lib/services/recovery-factor.service'
import { ALREADY_STORED, parseProvenance } from '@luciddata/core/validations/provenance'
import type { VaultData, InsertVaultData, UpdateVaultData } from '@/types/database.types'
import { UserFacingError } from '@/lib/actions/action-result'
import { assertHealthDataConsent } from '@/lib/services/legal.service'
import { isHealthEntry } from '@/lib/constants/legal'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

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

/** One entry's answer in a batch: the stored row, or why it was not stored. */
export type BatchEntryResult =
  | { index: number; data: VaultData }
  | { index: number; error: string; code: string }

/**
 * Store up to 100 entries for an import.
 *
 * Each entry succeeds or fails on its own, and a refusal says which entry and
 * why. Recovery and health consent are checked once for the batch. A record
 * the vault already holds from the same source is answered `already_stored`
 * before anything is written, so running an import again adds nothing.
 *
 * One audit entry records the batch and lists the ids it stored. An import is
 * one thing the person did, and a thousand identical lines would bury
 * everything else in their log.
 */
export async function createVaultDataBatch(
  userId: string,
  entries: CreateVaultPayload[]
): Promise<BatchEntryResult[]> {
  const results: BatchEntryResult[] = []
  const refuse = (index: number, error: string, code: string) => {
    results[index] = { index, error, code }
  }

  try {
    await assertRecoveryReadyForFirstWrite(userId)
  } catch (error) {
    if (error instanceof UserFacingError) {
      return entries.map((_, index) => ({ index, error: error.message, code: error.code ?? 'refused' }))
    }
    throw error
  }

  let healthRefusal: UserFacingError | null = null
  if (entries.some((entry) => isHealthEntry(entry))) {
    try {
      await assertHealthDataConsent(userId)
    } catch (error) {
      if (!(error instanceof UserFacingError)) throw error
      healthRefusal = error
    }
  }

  const pending: { index: number; row: InsertVaultData }[] = []
  for (const [index, entry] of entries.entries()) {
    if (healthRefusal && isHealthEntry(entry)) {
      refuse(index, healthRefusal.message, healthRefusal.code ?? 'refused')
      continue
    }
    try {
      const provenance = parseProvenance({
        source_provider: entry.source_provider,
        source_record_id: entry.source_record_id,
        source_captured_at: entry.source_captured_at,
      })
      pending.push({ index, row: { ...pick(entry, CREATE_FIELDS), ...provenance, user_id: userId } as InsertVaultData })
    } catch {
      refuse(index, 'This entry is not valid.', 'invalid_input')
    }
  }

  // Records already in the vault, or repeated in this batch, are answered
  // before anything is written.
  const byProvider = new Map<string, string[]>()
  for (const { row } of pending) {
    if (row.source_provider && row.source_record_id) {
      const ids = byProvider.get(row.source_provider) ?? []
      ids.push(row.source_record_id)
      byProvider.set(row.source_provider, ids)
    }
  }
  const stored = new Map<string, Set<string>>()
  for (const [provider, ids] of byProvider) {
    stored.set(provider, await vaultRepo.findStoredSourceRecordIds(userId, provider, ids))
  }
  const fresh: typeof pending = []
  for (const item of pending) {
    const { source_provider: provider, source_record_id: recordId } = item.row
    if (provider && recordId) {
      const seen = stored.get(provider)!
      if (seen.has(recordId)) {
        refuse(item.index, 'This record is already in your vault', ALREADY_STORED)
        continue
      }
      seen.add(recordId)
    }
    fresh.push(item)
  }

  const created: VaultData[] = []
  if (fresh.length > 0) {
    let inserted: VaultData[] | null = null
    try {
      inserted = await vaultRepo.createVaultEntries(fresh.map((item) => item.row))
    } catch {
      // Something about one entry refused the whole insert, or another request
      // stored the same record a moment ago. Store them one at a time so each
      // gets its own answer.
    }
    if (inserted) {
      // Each envelope is unique, because every entry has its own random key.
      const byCiphertext = new Map(inserted.map((row) => [row.client_ciphertext, row]))
      for (const item of fresh) {
        const row = byCiphertext.get(item.row.client_ciphertext)
        if (row) {
          results[item.index] = { index: item.index, data: row }
          created.push(row)
        } else {
          refuse(item.index, 'This entry could not be stored. Try again.', 'internal')
        }
      }
    } else {
      for (const item of fresh) {
        try {
          const row = await vaultRepo.createVaultEntry(item.row)
          results[item.index] = { index: item.index, data: row }
          created.push(row)
        } catch (error) {
          if (isDuplicateSourceRecord(error)) {
            refuse(item.index, 'This record is already in your vault', ALREADY_STORED)
          } else {
            errorLogger.log(error, ErrorSeverity.HIGH, { userId, action: 'VAULT_BATCH_ENTRY_FAILED' })
            refuse(item.index, 'This entry could not be stored. Try again.', 'internal')
          }
        }
      }
    }
  }

  if (created.length > 0) {
    const providers = [...new Set(created.map((row) => row.source_provider).filter(Boolean))]
    const noun = created.length === 1 ? 'entry' : 'entries'
    await createAuditEntry({
      userId,
      eventType: 'data_created',
      action: `Imported ${created.length} vault ${noun}`,
      metadata: { vault_data_ids: created.map((row) => row.id), source_providers: providers },
    })
  }

  return entries.map((_, index) => results[index])
}

/** The record ids already stored from a source, so an import can skip them before encrypting. */
export async function listStoredSourceRecordIds(userId: string, provider: string): Promise<string[]> {
  return vaultRepo.findAllSourceRecordIds(userId, provider)
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
