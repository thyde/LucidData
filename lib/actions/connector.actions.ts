'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  availableConnectors,
  disconnectSource,
  listSources,
  type ConnectedSource,
} from '@/lib/services/connector.service'
import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import type { PendingIngest } from '@/types/database.types'

/**
 * LD-201 connector actions.
 *
 * Publishing the ingestion public key is the only write a person makes here.
 * Everything else is read, disconnect, or draining the sealed queue after
 * unlock. Tokens are never touched from the client.
 */

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

const publishKeySchema = z.object({
  publicKey: z.string().min(40).max(4000),
  wrappedPrivateKey: z.string().min(20).max(8000),
  salt: z.string().min(8).max(200),
})

/**
 * Publish the public half of the ingestion keypair and store the wrapped
 * private half.
 *
 * Refuses to replace an existing key. Overwriting it would strand every sealed
 * record already queued, which the person would experience as silent data
 * loss rather than an error.
 */
export async function publishIngestionKeyAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const payload = publishKeySchema.parse(input)

  const service = createServiceClient()
  const { data: existing } = await service
    .from('users')
    .select('ingest_public_key')
    .eq('id', userId)
    .maybeSingle()
  if (existing?.ingest_public_key) return

  const { error } = await service
    .from('users')
    .update({
      ingest_public_key: payload.publicKey,
      wrapped_ingest_private_key: payload.wrappedPrivateKey,
      ingest_key_salt: payload.salt,
    })
    .eq('id', userId)
  if (error) throw error
}

export interface IngestionKeyState {
  publicKey: string | null
  wrappedPrivateKey: string | null
  salt: string | null
}

export async function getIngestionKeyAction(): Promise<IngestionKeyState> {
  const userId = await getAuthenticatedUserId()
  const service = createServiceClient()
  const { data, error } = await service
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

export async function listConnectorsAction(): Promise<{
  available: { id: string; label: string }[]
  connected: ConnectedSource[]
}> {
  const userId = await getAuthenticatedUserId()
  return { available: availableConnectors(), connected: await listSources(userId) }
}

const disconnectSchema = z.object({
  sourceId: z.string().uuid(),
  deleteImported: z.boolean().default(false),
})

export async function disconnectSourceAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { sourceId, deleteImported } = disconnectSchema.parse(input)
    await disconnectSource(userId, sourceId, { deleteImported })
    revalidatePath('/settings')
  })
}

/**
 * A queued record, with the provider resolved.
 *
 * LD-202 needs the provider slug on the vault entry, and the queue row only
 * carries a source id. Resolving it here keeps the join server-side rather
 * than making the browser fetch the source list to write one field.
 */
export interface PendingIngestRecord extends PendingIngest {
  provider: string
}

/** Sealed records waiting for this person to open them. */
export async function listPendingIngestAction(): Promise<PendingIngestRecord[]> {
  const userId = await getAuthenticatedUserId()
  const service = createServiceClient()
  const { data, error } = await service
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
 * Drop pending rows once the browser has opened them and written real vault
 * entries. Scoped to the caller, so one person cannot clear another's queue.
 */
export async function clearPendingIngestAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(input)
  if (ids.length === 0) return

  const service = createServiceClient()
  const { error } = await service
    .from('pending_ingest')
    .delete()
    .eq('user_id', userId)
    .in('id', ids)
  if (error) throw error
}
