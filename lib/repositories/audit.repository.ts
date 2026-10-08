import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AuditLog, InsertAuditLog } from '@/types/database.types'
import { afterKey, readAllPages } from '@/lib/repositories/paging'

/** The columns an audit entry's hash covers, plus its id for paging. */
export type AuditChainLink = Pick<
  AuditLog,
  'id' | 'user_id' | 'event_type' | 'action' | 'timestamp' | 'previous_hash' | 'current_hash'
>

const CHAIN_COLUMNS = 'id, user_id, event_type, action, timestamp, previous_hash, current_hash'

async function readWholeLog<Row extends { id: string; timestamp: string }>(
  userId: string,
  columns: string
): Promise<Row[]> {
  const supabase = await createClient()
  return readAllPages<Row>(
    (after, limit) => {
      let query = supabase.from('audit_logs').select(columns).eq('user_id', userId)
      if (after) query = query.gte('timestamp', after.at).or(afterKey('timestamp', after))
      return query
        .order('timestamp', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>
    },
    (row) => ({ at: row.timestamp, id: row.id })
  )
}

/** The whole chain, oldest first, with only the columns verification needs. */
export async function findAuditChain(userId: string): Promise<AuditChainLink[]> {
  return readWholeLog<AuditChainLink>(userId, CHAIN_COLUMNS)
}

/** Every entry, oldest first, for an export. */
export async function findAllAuditLogs(userId: string): Promise<AuditLog[]> {
  return readWholeLog<AuditLog>(userId, '*')
}

export async function findAuditLogsByUserId(userId: string, limit = 100): Promise<AuditLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

/**
 * The entry a new one links to. Read with the service role, scoped to the
 * person: some entries are written without their session, by a scheduled job
 * or the public verify page, and through row level security those writers
 * would see no entry at all and start a second chain.
 */
export async function findLatestAuditLog(userId: string): Promise<AuditLog | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('current_hash')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as AuditLog | null
}

export async function createAuditLog(entry: InsertAuditLog): Promise<AuditLog> {
  // Use service role to bypass RLS (users cannot insert their own audit logs)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data
}
