import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AuditLog, Json } from '@/types/database.types'
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

/** The person's head as their own session sees it, for verification. */
export async function findOwnChainHead(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_chain_heads')
    .select('head_hash')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.head_hash ?? null
}

/** What an append records. The database adds the link, the hash, and the time. */
export interface AuditAppend {
  user_id: string
  event_type: string
  action: string
  vault_data_id?: string | null
  consent_id?: string | null
  actor_id?: string | null
  actor_type?: string | null
  actor_name?: string | null
  ip_address?: string | null
  user_agent?: string | null
  method?: string | null
  success?: boolean | null
  error_message?: string | null
  metadata?: Json | null
}

/**
 * Append an entry to the person's chain through append_audit_log, which
 * reads the head under its row lock and hashes the entry there, so appends
 * made at the same moment take turns rather than branching or failing. The
 * service role is needed because people cannot write their own audit log,
 * and some entries are written without their session, by a scheduled job or
 * the public verify page.
 */
export async function appendAuditLog(entry: AuditAppend): Promise<AuditLog> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('append_audit_log', {
    p_user_id: entry.user_id,
    p_event_type: entry.event_type,
    p_action: entry.action,
    p_vault_data_id: entry.vault_data_id ?? undefined,
    p_consent_id: entry.consent_id ?? undefined,
    p_actor_id: entry.actor_id ?? undefined,
    p_actor_type: entry.actor_type ?? undefined,
    p_actor_name: entry.actor_name ?? undefined,
    p_ip_address: entry.ip_address ?? undefined,
    p_user_agent: entry.user_agent ?? undefined,
    p_method: entry.method ?? undefined,
    p_success: entry.success ?? undefined,
    p_error_message: entry.error_message ?? undefined,
    p_metadata: entry.metadata ?? undefined,
  })
  if (error) throw error
  return data as AuditLog
}
