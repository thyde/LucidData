import { createServiceClient } from '@/lib/supabase/service'

/**
 * LD-210 re-wraps sent in parts.
 *
 * A password change or a recovery re-wraps every entry's data key on the
 * device. A large vault's envelopes do not fit in one request, so they arrive
 * in parts, wait in `vault_rewrap_entries`, and `apply_vault_rewrap` stores
 * them all in one transaction. Both tables are closed to the API roles, so
 * this uses the service role, and every query names the person it is for. The
 * account service checks the step-up grant before any of it runs.
 */

export type RewrapReason = 'password_change' | 'recovery'

export interface StagedEnvelope {
  id: string
  encrypted_dek: string
  dek_salt: string
  previous_encrypted_dek: string
}

/**
 * The connector ingestion key as the device read it, and its new wrap. The
 * stored key must still be `previous`, null meaning there was none, and a
 * null `wrapped` leaves it as it is. A type rather than an interface, so it
 * is assignable to Json.
 */
export type IngestKeyMove = {
  previous: string | null
  wrapped: string | null
}

/** Start a re-wrap. Only one runs at a time, so anything an earlier attempt staged is dropped. */
export async function startRewrap(userId: string, reason: RewrapReason): Promise<string> {
  const service = createServiceClient()
  const { error: clearError } = await service.from('vault_rewraps').delete().eq('user_id', userId)
  if (clearError) throw clearError

  const { data, error } = await service
    .from('vault_rewraps')
    .insert({ user_id: userId, reason })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** The person's re-wrap, if it exists and has not expired. */
export async function findActiveRewrap(
  userId: string,
  rewrapId: string
): Promise<{ id: string; reason: RewrapReason } | null> {
  const { data, error } = await createServiceClient()
    .from('vault_rewraps')
    .select('id, reason')
    .eq('id', rewrapId)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return data ? { id: data.id, reason: data.reason as RewrapReason } : null
}

/** Add a part. An entry sent again replaces what was staged for it, so a part can be retried. */
export async function stageRewrapEntries(rewrapId: string, entries: StagedEnvelope[]): Promise<void> {
  if (entries.length === 0) return
  const { error } = await createServiceClient()
    .from('vault_rewrap_entries')
    .upsert(
      entries.map((entry) => ({
        rewrap_id: rewrapId,
        vault_data_id: entry.id,
        encrypted_dek: entry.encrypted_dek,
        dek_salt: entry.dek_salt,
        previous_encrypted_dek: entry.previous_encrypted_dek,
      })),
      { onConflict: 'rewrap_id,vault_data_id' }
    )
  if (error) throw error
}

export async function countStagedEntries(rewrapId: string): Promise<number> {
  const { count, error } = await createServiceClient()
    .from('vault_rewrap_entries')
    .select('vault_data_id', { count: 'exact', head: true })
    .eq('rewrap_id', rewrapId)
  if (error) throw error
  return count ?? 0
}

export async function countVaultEntries(userId: string): Promise<number> {
  const { count, error } = await createServiceClient()
    .from('vault_data')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw error
  return count ?? 0
}

export async function dropRewrap(userId: string, rewrapId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from('vault_rewraps')
    .delete()
    .eq('id', rewrapId)
    .eq('user_id', userId)
  if (error) throw error
}

/**
 * Store every staged envelope, and the ingestion key, in one transaction.
 * Returns how many entries moved. The function refuses with PT409 when the
 * vault or the ingestion key no longer matches what was read, and PT410 when
 * the re-wrap expired.
 */
export async function applyRewrap(userId: string, rewrapId: string, ingestKey?: IngestKeyMove): Promise<number> {
  const { data, error } = await createServiceClient().rpc('apply_vault_rewrap', {
    p_user_id: userId,
    p_rewrap_id: rewrapId,
    ...(ingestKey ? { p_ingest_key: ingestKey } : {}),
  })
  if (error) throw error
  return data
}

/** Drop re-wraps nobody finished. Their staged envelopes go with them. */
export async function purgeExpiredRewraps(now: Date = new Date()): Promise<number> {
  const { data, error } = await createServiceClient()
    .from('vault_rewraps')
    .delete()
    .lt('expires_at', now.toISOString())
    .select('id')
  if (error) throw error
  return (data ?? []).length
}
