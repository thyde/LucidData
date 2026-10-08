'use server'

import { guarded, UserFacingError, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  createVaultData,
  createVaultDataBatch,
  getUserVaultData,
  getVaultDataById,
  listStoredSourceRecordIds,
  updateVaultData,
  deleteVaultData,
} from '@/lib/services/vault.service'
import {
  vaultEntryBatchCreateSchema,
  vaultEntryCreateSchema,
  vaultEntryUpdateSchema,
} from '@luciddata/core/validations/client-api'
import { sourceProviderSchema } from '@luciddata/core/validations/provenance'
import type { VaultData } from '@/types/database.types'
import type { z } from 'zod'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

// The id shape the client API accepts. Anything else cannot name an entry.
const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isEntryId(id: unknown): id is string {
  return typeof id === 'string' && ENTRY_ID.test(id)
}

function entryId(id: unknown): string {
  if (!isEntryId(id)) throw new UserFacingError('Vault entry not found', 'not_found')
  return id
}

// Every caller checks its input first, so a refusal here is a bug in a caller.
// It is returned with the field named, rather than thrown and sanitized into
// a message nobody can act on.
function parseEntry<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue.path.join('.')
  throw new UserFacingError(
    `This entry was not saved. ${field ? `${field}: ` : ''}${issue.message}`,
    'invalid_input'
  )
}

export async function getVaultEntriesAction(): Promise<VaultData[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getUserVaultData(userId)
  })
}

export async function getVaultEntryAction(id: string): Promise<VaultData | null | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    if (!isEntryId(id)) return null
    return getVaultDataById(id, userId)
  })
}

// Both writes parse with the client API's schemas, so the web app and the API
// accept the same fields, the encrypted envelope is never empty, and nothing a
// caller adds reaches the database.

export async function createVaultEntryAction(payload: {
  label: string
  category?: string
  tags?: string[]
  schema_type?: string
  description?: string
  client_ciphertext: string
  encrypted_dek: string
  dek_salt: string
  expires_at?: string
  // LD-202 provenance for an imported entry. Validated in the service.
  source_provider?: string
  source_record_id?: string
  source_captured_at?: string
}): Promise<VaultData | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return createVaultData(userId, parseEntry(vaultEntryCreateSchema, payload))
  })
}

/** One entry's answer: its new id, or why it was not stored. */
export type StoredEntryResult = { index: number; id: string } | { index: number; code: string; error: string }

/** Store up to 100 entries an import encrypted. Each is answered on its own. */
export async function createVaultEntriesAction(
  entries: Parameters<typeof createVaultEntryAction>[0][]
): Promise<StoredEntryResult[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const parsed = parseEntry(vaultEntryBatchCreateSchema, { entries })
    const results = await createVaultDataBatch(userId, parsed.entries)
    // The browser needs to know what was stored, not to receive the ciphertext back.
    return results.map((result) =>
      'data' in result
        ? { index: result.index, id: result.data.id }
        : { index: result.index, code: result.code, error: result.error }
    )
  })
}

/** The record ids already stored from a source, so an import that stopped can carry on. */
export async function getStoredSourceRecordIdsAction(provider: string): Promise<string[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return listStoredSourceRecordIds(userId, parseEntry(sourceProviderSchema, provider))
  })
}

export async function updateVaultEntryAction(id: string, payload: {
  label?: string
  category?: string
  tags?: string[]
  description?: string
  client_ciphertext?: string
  encrypted_dek?: string
  dek_salt?: string
  expires_at?: string
}): Promise<VaultData | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return updateVaultData(entryId(id), userId, parseEntry(vaultEntryUpdateSchema, payload))
  })
}

export async function deleteVaultEntryAction(id: string): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return deleteVaultData(entryId(id), userId)
  })
}
