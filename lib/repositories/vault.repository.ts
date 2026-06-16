import { createClient } from '@/lib/supabase/server'
import type { VaultData, InsertVaultData, UpdateVaultData } from '@/types/database.types'

export async function findVaultByUserId(userId: string): Promise<VaultData[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_data')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function findVaultById(id: string, userId: string): Promise<VaultData | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_data')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function findVaultByCategory(userId: string, category: string): Promise<VaultData[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_data')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createVaultEntry(entry: InsertVaultData): Promise<VaultData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_data')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateVaultEntry(id: string, userId: string, updates: UpdateVaultData): Promise<VaultData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_data')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteVaultEntry(id: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('vault_data')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}
