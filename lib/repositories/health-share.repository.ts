import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { InsertHealthShare } from '@/types/database.types'

/**
 * LD-305 health shares.
 *
 * A person reads their own shares through their session, so row level security
 * applies, and never the ciphertext, which the database does not let them
 * select. Only the server writes shares, so writes and the public open go
 * through the service role, always scoped by the share's owner where there is
 * one.
 */

/** Every column a person may read about their own share. */
const OWNER_COLUMNS =
  'id, consent_id, metrics, range_start, range_end, expires_at, revoked_at, view_count, last_viewed_at, created_at'

export interface HealthShareSummary {
  id: string
  consent_id: string
  metrics: string[]
  range_start: string
  range_end: string
  expires_at: string
  revoked_at: string | null
  view_count: number
  last_viewed_at: string | null
  created_at: string
  /** The label the person gave it, from its consent. */
  label: string | null
}

type OwnerRow = Omit<HealthShareSummary, 'label'> & { consents: { granted_to_name: string | null } | null }

function summarise(row: OwnerRow): HealthShareSummary {
  const { consents, ...share } = row
  return { ...share, label: consents?.granted_to_name ?? null }
}

export async function findSharesForUser(userId: string): Promise<HealthShareSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('health_shares')
    .select(`${OWNER_COLUMNS}, consents(granted_to_name)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as OwnerRow[]).map(summarise)
}

export async function findShareForUser(id: string, userId: string): Promise<HealthShareSummary | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('health_shares')
    .select(`${OWNER_COLUMNS}, consents(granted_to_name)`)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? summarise(data as unknown as OwnerRow) : null
}

/** Shares that still open: neither revoked nor past their expiry. */
export async function countOpenShares(userId: string, now: Date): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('health_shares')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
  if (error) throw error
  return count ?? 0
}

export async function insertShare(share: InsertHealthShare & { id: string }): Promise<void> {
  const service = createServiceClient()
  const { error } = await service.from('health_shares').insert(share)
  if (error) throw error
}

/** Undo a share whose receipt could not be issued. Scoped to its owner. */
export async function deleteShare(id: string, userId: string): Promise<void> {
  const service = createServiceClient()
  const { error } = await service.from('health_shares').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export type OpenedShare =
  | { state: 'missing' }
  | { state: 'revoked' | 'expired'; expiresAt: string }
  | {
      state: 'open'
      ciphertext: string
      expiresAt: string
      createdAt: string
      userId: string
      consentId: string
      previousViewAt: string | null
    }

/** Open a share from its link: the ciphertext while it is open, and the view counted. */
export async function openShare(id: string): Promise<OpenedShare> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('open_health_share', { p_id: id })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : null
  if (!row || row.state === 'missing') return { state: 'missing' }
  if (row.state === 'open' && row.ciphertext) {
    return {
      state: 'open',
      ciphertext: row.ciphertext,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      userId: row.user_id,
      consentId: row.consent_id,
      previousViewAt: row.previous_view_at ?? null,
    }
  }
  return { state: row.state === 'revoked' ? 'revoked' : 'expired', expiresAt: row.expires_at }
}

/** Clear the ciphertext of every share past its expiry. Returns how many were cleared. */
export async function clearExpiredShares(now: Date): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('health_shares')
    .update({ ciphertext: null })
    .not('ciphertext', 'is', null)
    .lt('expires_at', now.toISOString())
    .select('id')
  if (error) throw error
  return (data ?? []).length
}
