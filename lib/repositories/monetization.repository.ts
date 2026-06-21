import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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

// --- Cross-user supply aggregate (service role; returns anonymized counts only) ---

export interface CategorySupply {
  category: string
  sellers: number
  fields: number
  activeContributors: number
}

// Aggregate opted-in supply across all users by category. Buyers cannot read other
// users' rows under RLS, so this uses the service role and returns only counts.
export async function aggregateSupplyByCategory(): Promise<CategorySupply[]> {
  const service = createServiceClient()
  const [fieldsRes, contribRes] = await Promise.all([
    service.from('vault_field_monetization').select('category, user_id').eq('opted_in', true),
    service.from('pool_contributions').select('category, user_id').eq('status', 'active'),
  ])
  if (fieldsRes.error) throw fieldsRes.error
  if (contribRes.error) throw contribRes.error

  const fields = (fieldsRes.data ?? []) as { category: string; user_id: string }[]
  const contribs = (contribRes.data ?? []) as { category: string; user_id: string }[]

  const map = new Map<string, { sellers: Set<string>; fields: number; contributors: Set<string> }>()
  const bucket = (category: string) => {
    let b = map.get(category)
    if (!b) {
      b = { sellers: new Set<string>(), fields: 0, contributors: new Set<string>() }
      map.set(category, b)
    }
    return b
  }

  for (const row of fields) {
    const b = bucket(row.category)
    b.sellers.add(row.user_id)
    b.fields += 1
  }
  for (const row of contribs) {
    bucket(row.category).contributors.add(row.user_id)
  }

  return Array.from(map.entries()).map(([category, b]) => ({
    category,
    sellers: b.sellers.size,
    fields: b.fields,
    activeContributors: b.contributors.size,
  }))
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
