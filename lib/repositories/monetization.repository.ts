import { createClient } from '@/lib/supabase/server'
import type {
  VaultFieldMonetization,
  SalePreferences,
  InsertSalePreferences,
} from '@/types/database.types'

// --- Per-field monetization (RLS-scoped to the owner) ---

export async function findFieldsByVault(
  vaultDataId: string,
  userId: string
): Promise<VaultFieldMonetization[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_field_monetization')
    .select('*')
    .eq('vault_data_id', vaultDataId)
    .eq('user_id', userId)
  if (error) throw error
  return data
}

export async function findFieldsByUser(userId: string): Promise<VaultFieldMonetization[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vault_field_monetization')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

export async function upsertField(row: {
  vault_data_id: string
  user_id: string
  field_key: string
  category: string
  opted_in: boolean
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('vault_field_monetization')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'vault_data_id,field_key' }
    )
  if (error) throw error
}

// --- Sale preferences (RLS-scoped to the owner) ---

export async function findSalePreferences(userId: string): Promise<SalePreferences | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sale_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertSalePreferences(
  prefs: InsertSalePreferences
): Promise<SalePreferences> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sale_preferences')
    .upsert({ ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}
