'use server'

import { guarded, UserFacingError, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import { createVaultData, getUserVaultData, getVaultDataById, updateVaultData, deleteVaultData } from '@/lib/services/vault.service'
import { vaultEntryCreateSchema, vaultEntryUpdateSchema } from '@luciddata/core/validations/client-api'
import type { VaultData } from '@/types/database.types'

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
    return createVaultData(userId, vaultEntryCreateSchema.parse(payload))
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
    return updateVaultData(entryId(id), userId, vaultEntryUpdateSchema.parse(payload))
  })
}

export async function deleteVaultEntryAction(id: string): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return deleteVaultData(entryId(id), userId)
  })
}
