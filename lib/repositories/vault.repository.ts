import { createClient } from '@/lib/supabase/server'
import type { VaultData, InsertVaultData, UpdateVaultData } from '@/types/database.types'
import { afterKey, readAllPages } from '@/lib/repositories/paging'

/**
 * Every entry the person holds, newest first. Paged, because a single request
 * stops at 1,000 rows: the list, the export, and a password change's re-wrap
 * all need the whole vault.
 */
export async function findVaultByUserId(userId: string): Promise<VaultData[]> {
  const supabase = await createClient()
  const rows = await readAllPages<VaultData>(
    (after, limit) => {
      let query = supabase.from('vault_data').select('*').eq('user_id', userId)
      if (after) query = query.gte('created_at', after.at).or(afterKey('created_at', after))
      return query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
    },
    (row) => ({ at: row.created_at, id: row.id })
  )
  return rows.reverse()
}

/**
 * How many entries the person holds in each category. Reads three small
 * columns, never the ciphertext, for pages that only need the counts.
 */
export async function countVaultByCategory(userId: string): Promise<Map<string, number>> {
  const supabase = await createClient()
  const rows = await readAllPages<{ id: string; category: string; created_at: string }>(
    (after, limit) => {
      let query = supabase.from('vault_data').select('id, category, created_at').eq('user_id', userId)
      if (after) query = query.gte('created_at', after.at).or(afterKey('created_at', after))
      return query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
    },
    (row) => ({ at: row.created_at, id: row.id })
  )
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  return counts
}

/** Every entry's wrapped data key, which is all a re-wrap reads. Never the ciphertext. */
export async function findVaultKeyEnvelopes(
  userId: string
): Promise<{ id: string; encrypted_dek: string; dek_salt: string }[]> {
  const supabase = await createClient()
  const rows = await readAllPages<{ id: string; encrypted_dek: string; dek_salt: string; created_at: string }>(
    (after, limit) => {
      let query = supabase.from('vault_data').select('id, encrypted_dek, dek_salt, created_at').eq('user_id', userId)
      if (after) query = query.gte('created_at', after.at).or(afterKey('created_at', after))
      return query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
    },
    (row) => ({ at: row.created_at, id: row.id })
  )
  return rows.map(({ id, encrypted_dek, dek_salt }) => ({ id, encrypted_dek, dek_salt }))
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
  const rows = await readAllPages<VaultData>(
    (after, limit) => {
      let query = supabase.from('vault_data').select('*').eq('user_id', userId).eq('category', category)
      if (after) query = query.gte('created_at', after.at).or(afterKey('created_at', after))
      return query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
    },
    (row) => ({ at: row.created_at, id: row.id })
  )
  return rows.reverse()
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

/** Every record id the person holds from a source. Identifiers only, never content. */
export async function findAllSourceRecordIds(userId: string, provider: string): Promise<string[]> {
  const supabase = await createClient()
  const rows = await readAllPages<{ id: string; created_at: string; source_record_id: string | null }>(
    (after, limit) => {
      let query = supabase
        .from('vault_data')
        .select('id, created_at, source_record_id')
        .eq('user_id', userId)
        .eq('source_provider', provider)
      if (after) query = query.gte('created_at', after.at).or(afterKey('created_at', after))
      return query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
    },
    (row) => ({ at: row.created_at, id: row.id })
  )
  return rows.map((row) => row.source_record_id).filter((id): id is string => Boolean(id))
}

/** Insert several entries in one statement. */
export async function createVaultEntries(entries: InsertVaultData[]): Promise<VaultData[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('vault_data').insert(entries).select()
  if (error) throw error
  return data
}

/**
 * Which of these record ids the person already holds from a source. Asked in
 * groups, so the ids fit in a URL however long they are.
 */
export async function findStoredSourceRecordIds(
  userId: string,
  provider: string,
  recordIds: readonly string[]
): Promise<Set<string>> {
  const supabase = await createClient()
  const stored = new Set<string>()
  for (let start = 0; start < recordIds.length; start += 50) {
    const { data, error } = await supabase
      .from('vault_data')
      .select('source_record_id')
      .eq('user_id', userId)
      .eq('source_provider', provider)
      .in('source_record_id', recordIds.slice(start, start + 50))
    if (error) throw error
    for (const row of data ?? []) if (row.source_record_id) stored.add(row.source_record_id)
  }
  return stored
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
