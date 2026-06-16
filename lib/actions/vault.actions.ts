'use server'

import { createClient } from '@/lib/supabase/server'
import { createVaultData, getUserVaultData, getVaultDataById, updateVaultData, deleteVaultData } from '@/lib/services/vault.service'
import type { VaultData } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getVaultEntriesAction(): Promise<VaultData[]> {
  const userId = await getAuthenticatedUserId()
  return getUserVaultData(userId)
}

export async function getVaultEntryAction(id: string): Promise<VaultData | null> {
  const userId = await getAuthenticatedUserId()
  return getVaultDataById(id, userId)
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
}): Promise<VaultData> {
  const userId = await getAuthenticatedUserId()
  return createVaultData(userId, payload)
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
}): Promise<VaultData> {
  const userId = await getAuthenticatedUserId()
  return updateVaultData(id, userId, payload)
}

export async function deleteVaultEntryAction(id: string): Promise<void> {
  const userId = await getAuthenticatedUserId()
  return deleteVaultData(id, userId)
}
