'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import { createVaultData, getUserVaultData, getVaultDataById, updateVaultData, deleteVaultData } from '@/lib/services/vault.service'
import type { VaultData } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
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
    return getVaultDataById(id, userId)
  })
}

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
    return createVaultData(userId, payload)
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
    return updateVaultData(id, userId, payload)
  })
}

export async function deleteVaultEntryAction(id: string): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return deleteVaultData(id, userId)
  })
}
