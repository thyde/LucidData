import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { PendingIngest } from '@/types/database.types'
import type { PublishIngestionKeyInput } from '@luciddata/core/validations/connector'

/**
 * LD-201 sealed ingestion, from the person's side: publishing the key a sync
 * seals to, and draining the queue after the device has opened what arrived.
 *
 * Reads and deletes run under the person's own session, so row level security
 * decides what they reach. Publishing writes columns a signed-in session may
 * not set, so it goes through the service role, scoped to the caller.
 */

export interface IngestionKeyState {
  publicKey: string | null
  wrappedPrivateKey: string | null
  salt: string | null
}

/**
 * A queued record, with the provider resolved.
 *
 * LD-202 needs the provider slug on the vault entry, and the queue row only
 * carries a source id. Resolving it here keeps the join server-side rather
 * than making the device fetch the source list to write one field.
 */
export interface PendingIngestRecord extends PendingIngest {
  provider: string
}

export async function getIngestionKey(userId: string): Promise<IngestionKeyState> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('ingest_public_key, wrapped_ingest_private_key, ingest_key_salt')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return {
    publicKey: (data?.ingest_public_key as string | null) ?? null,
    wrappedPrivateKey: (data?.wrapped_ingest_private_key as string | null) ?? null,
    salt: (data?.ingest_key_salt as string | null) ?? null,
  }
}

/**
 * Publish the public half of the ingestion keypair and store the wrapped
 * private half.
 *
 * Refuses to replace an existing key. Overwriting it would strand every sealed
 * record already queued, which the person would experience as silent data
 * loss rather than an error. Returns whether this call stored the key.
 */
export async function publishIngestionKey(
  userId: string,
  payload: PublishIngestionKeyInput
): Promise<boolean> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('users')
    .update({
      ingest_public_key: payload.publicKey,
      wrapped_ingest_private_key: payload.wrappedPrivateKey,
      ingest_key_salt: payload.salt,
    })
    .eq('id', userId)
    .is('ingest_public_key', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

/**
 * Store the ingestion private key re-wrapped under a new master key, after a
 * password change or a recovery. The private half is wrapped under the master
 * key itself, so without this every record a sync seals would become
 * unreadable. Compare-and-swap: the write only lands while the stored wrap is
 * still the one the device re-wrapped. Returns whether it landed.
 */
export async function rewrapIngestionKey(
  userId: string,
  key: { previous: string; wrapped: string }
): Promise<boolean> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('users')
    .update({ wrapped_ingest_private_key: key.wrapped })
    .eq('id', userId)
    .eq('wrapped_ingest_private_key', key.previous)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

/** Sealed records waiting for this person to open them, oldest first. */
export async function listPendingIngest(userId: string): Promise<PendingIngestRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pending_ingest')
    .select('*, data_sources(provider)')
    .eq('user_id', userId)
    .order('created_at')
    .limit(200)
  if (error) throw error

  return (data ?? []).map((row) => {
    const { data_sources: source, ...rest } = row as PendingIngest & {
      data_sources?: { provider?: string } | null
    }
    return { ...rest, provider: source?.provider ?? '' } as PendingIngestRecord
  })
}

/**
 * Drop queued rows once the device has opened them and written real vault
 * entries. Row level security limits the delete to the caller's own queue.
 */
export async function clearPendingIngest(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createClient()
  const { error } = await supabase
    .from('pending_ingest')
    .delete()
    .eq('user_id', userId)
    .in('id', ids)
  if (error) throw error
}
