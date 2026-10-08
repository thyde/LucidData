'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  availableConnectors,
  disconnectSource,
  listSources,
  type ConnectedSource,
} from '@/lib/services/connector.service'
import {
  clearPendingIngest,
  getIngestionKey,
  listPendingIngest,
  publishIngestionKey,
  type IngestionKeyState,
  type PendingIngestRecord,
} from '@/lib/services/ingestion.service'
import {
  clearPendingIngestSchema,
  disconnectSourceSchema,
  publishIngestionKeySchema,
} from '@luciddata/core/validations/connector'
import { guarded, type ActionFailure } from '@/lib/actions/action-result'

export type { IngestionKeyState, PendingIngestRecord }

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

/**
 * Publish the public half of the ingestion keypair and store the wrapped
 * private half. An existing key is never replaced.
 */
export async function publishIngestionKeyAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await publishIngestionKey(userId, publishIngestionKeySchema.parse(input))
  })
}

export async function getIngestionKeyAction(): Promise<IngestionKeyState | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getIngestionKey(userId)
  })
}

export async function listConnectorsAction(): Promise<{
  available: { id: string; label: string }[]
  connected: ConnectedSource[]
} | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return { available: availableConnectors(), connected: await listSources(userId) }
  })
}

export async function disconnectSourceAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { sourceId, deleteImported } = disconnectSourceSchema.parse(input)
    await disconnectSource(userId, sourceId, { deleteImported })
    revalidatePath('/settings')
  })
}

/** Sealed records waiting for this person to open them. */
export async function listPendingIngestAction(): Promise<PendingIngestRecord[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return listPendingIngest(userId)
  })
}

/**
 * Drop pending rows once the browser has opened them and written real vault
 * entries. Scoped to the caller, so one person cannot clear another's queue.
 */
export async function clearPendingIngestAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { ids } = clearPendingIngestSchema.parse(input)
    await clearPendingIngest(userId, ids)
  })
}
