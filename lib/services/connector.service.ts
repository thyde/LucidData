/**
 * LD-201 connector framework.
 *
 * Connecting a provider fills a vault that would otherwise stay empty. The
 * whole design turns on one constraint: the sync worker runs while the person
 * is away, so it must be able to write records it cannot read.
 *
 * The flow is:
 *   1. The browser generates an ingestion keypair and publishes the public half.
 *   2. The worker fetches from the provider, normalizes, and seals each record
 *      to that public key. It writes to pending_ingest.
 *   3. On next unlock the browser opens each sealed record, re-encrypts it
 *      under the normal vault envelope, writes it, and deletes the pending row.
 *
 * Step 2 is the one that matters. Nothing the worker holds can open what it
 * wrote, so automation does not quietly turn us into a data processor.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { UserFacingError } from '@/lib/actions/action-result'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import {
  isConnectorStorageConfigured,
  unwrapToken,
  wrapToken,
} from '@/lib/services/connector-tokens'
import { sealToPublicKey } from '@/lib/crypto/ingestion-keys'
import {
  FITNESS_CONNECTORS,
  normalizeFitbitDay,
  normalizeStravaActivity,
  type FitnessProvider,
  type FitbitDailySummary,
  type StravaActivity,
} from '@/lib/connectors/fitness'
import type { DataSource } from '@/types/database.types'

export type ConnectorProvider = FitnessProvider

/** Refresh this far before expiry, so a sync never starts on a dead token. */
export const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000

/** Providers whose credentials are configured in this environment. */
export function availableConnectors(): { id: ConnectorProvider; label: string }[] {
  if (!isConnectorStorageConfigured()) return []
  return (Object.values(FITNESS_CONNECTORS) as (typeof FITNESS_CONNECTORS)[FitnessProvider][])
    .filter((def) => Boolean(process.env[def.clientIdEnv] && process.env[def.clientSecretEnv]))
    .map((def) => ({ id: def.id, label: def.label }))
}

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return value in FITNESS_CONNECTORS
}

export interface ConnectedSource {
  id: string
  provider: string
  label: string
  status: string
  scopes: string[]
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
  // LD-202 what this source has actually delivered, which "last synced" alone
  // does not say. A backfill covering six months and a sync holding only
  // yesterday look identical without it.
  recordCount: number
  firstCapturedAt: string | null
  lastCapturedAt: string | null
}

interface CoverageRow {
  provider: string
  record_count: number
  first_captured_at: string | null
  last_captured_at: string | null
}

export async function listSources(userId: string): Promise<ConnectedSource[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_sources')
    .select('*')
    .eq('user_id', userId)
    .order('created_at')
  if (error) throw error

  // Metadata only. The function reads three provenance columns and counts
  // rows; it never touches ciphertext. A failure here degrades the panel
  // rather than hiding the sources.
  const coverage = new Map<string, CoverageRow>()
  const { data: rows } = await service.rpc('vault_source_coverage', { p_user_id: userId })
  for (const row of (rows ?? []) as CoverageRow[]) {
    coverage.set(row.provider, row)
  }

  return (data ?? []).map((source) => {
    const stats = coverage.get(source.provider as string)
    return {
      id: source.id as string,
      provider: source.provider as string,
      label:
        FITNESS_CONNECTORS[source.provider as FitnessProvider]?.label ??
        (source.provider as string),
      status: source.status as string,
      scopes: (source.scopes as string[]) ?? [],
      lastSyncedAt: (source.last_synced_at as string | null) ?? null,
      lastError: (source.last_error as string | null) ?? null,
      createdAt: source.created_at as string,
      recordCount: Number(stats?.record_count ?? 0),
      firstCapturedAt: stats?.first_captured_at ?? null,
      lastCapturedAt: stats?.last_captured_at ?? null,
    }
  })
}

/**
 * Store the tokens a completed OAuth exchange produced.
 *
 * Upserts on (user_id, provider): reconnecting replaces the old grant rather
 * than accumulating stale tokens that would keep working after the person
 * thought they had disconnected.
 */
export async function saveConnection(input: {
  userId: string
  provider: ConnectorProvider
  accessToken: string
  refreshToken?: string | null
  expiresAt?: string | null
  scopes: string[]
  providerAccountId?: string | null
}): Promise<DataSource> {
  const service = createServiceClient()
  const access = wrapToken(input.accessToken)
  const refresh = input.refreshToken ? wrapToken(input.refreshToken) : null

  const { data, error } = await service
    .from('data_sources')
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        status: 'connected',
        scopes: input.scopes,
        encrypted_access_token: `${access.iv}|${access.ciphertext}`,
        encrypted_refresh_token: refresh ? `${refresh.iv}|${refresh.ciphertext}` : null,
        token_expires_at: input.expiresAt ?? null,
        provider_account_id: input.providerAccountId ?? null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )
    .select('*')
    .single()
  if (error) throw error

  await createAuditEntry({
    userId: input.userId,
    eventType: 'data_source_connected',
    action: `Connected ${FITNESS_CONNECTORS[input.provider].label}`,
    metadata: { provider: input.provider, scopes: input.scopes },
  })

  return data as DataSource
}

function readToken(stored: string | null): string | null {
  if (!stored) return null
  const separator = stored.indexOf('|')
  if (separator < 0) return null
  return unwrapToken({
    iv: stored.slice(0, separator),
    ciphertext: stored.slice(separator + 1),
  })
}

/**
 * Disconnect a provider.
 *
 * Revokes upstream first where the provider supports it, because deleting our
 * copy of a token that still works elsewhere is not disconnecting. Already
 * imported vault entries are the person's own data and are kept unless they
 * ask otherwise.
 */
export async function disconnectSource(
  userId: string,
  sourceId: string,
  options: { deleteImported?: boolean } = {}
): Promise<void> {
  const service = createServiceClient()
  const { data: source } = await service
    .from('data_sources')
    .select('*')
    .eq('id', sourceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!source) throw new UserFacingError('Source not found')

  await revokeUpstream(source as DataSource).catch((error) => {
    errorLogger.log(error, ErrorSeverity.LOW, {
      userId,
      action: 'CONNECTOR_REVOKE_FAILED',
      resource: 'data_sources',
    })
  })

  // Pending sealed records go with the source. They were fetched under a grant
  // that no longer exists.
  await service.from('pending_ingest').delete().eq('data_source_id', sourceId)
  await service.from('data_sources').delete().eq('id', sourceId).eq('user_id', userId)

  if (options.deleteImported) {
    await service
      .from('vault_data')
      .delete()
      .eq('user_id', userId)
      .eq('source_provider', source.provider as string)
  }

  await createAuditEntry({
    userId,
    eventType: 'data_source_disconnected',
    action: `Disconnected ${source.provider}`,
    metadata: {
      provider: source.provider,
      deleted_imported: Boolean(options.deleteImported),
    },
  })
}

async function revokeUpstream(source: DataSource): Promise<void> {
  if (source.provider !== 'strava') return
  const token = readToken(source.encrypted_access_token)
  if (!token) return
  await fetch('https://www.strava.com/oauth/deauthorize', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
}

export interface SyncResult {
  imported: number
  failed: number
}

/**
 * Fetch, normalize, and seal. Never decrypt.
 *
 * A source whose person has not published an ingestion key is skipped rather
 * than stored in the clear, which is the only safe way to fail here.
 */
export async function syncSource(
  source: DataSource,
  fetchImpl: typeof fetch = fetch
): Promise<SyncResult> {
  const service = createServiceClient()
  const result: SyncResult = { imported: 0, failed: 0 }

  const { data: user } = await service
    .from('users')
    .select('ingest_public_key')
    .eq('id', source.user_id)
    .maybeSingle()
  const publicKey = user?.ingest_public_key as string | undefined
  if (!publicKey) {
    // No key means nowhere safe to put the result. Storing it readable would
    // defeat the entire design, so the sync waits instead.
    await markSourceError(source.id, 'Waiting for the vault to be unlocked once')
    return result
  }

  let token: string | null
  try {
    token = await ensureFreshToken(source, fetchImpl)
  } catch (error) {
    await markSourceError(
      source.id,
      error instanceof Error ? error.message : 'Could not refresh access'
    )
    return result
  }
  if (!token) {
    await markSourceError(source.id, 'No access token stored')
    return result
  }

  let records: { providerRecordId: string; label: string; capturedAt: string | null; payload: Record<string, unknown> }[]
  try {
    records = await fetchRecords(source.provider as ConnectorProvider, token, fetchImpl)
  } catch (error) {
    await markSourceError(
      source.id,
      error instanceof Error ? error.message : 'Provider request failed'
    )
    return result
  }

  const def = FITNESS_CONNECTORS[source.provider as FitnessProvider]

  for (const record of records) {
    try {
      // The label travels inside the sealed payload, not beside it. A Strava
      // activity name is classified as an identifier in LD-501 precisely
      // because it routinely contains places and people, so storing it in the
      // clear here would leak exactly what the sealed box protects.
      const sealed = await sealToPublicKey(
        publicKey,
        JSON.stringify({ __label: record.label, ...record.payload })
      )
      const { error } = await service.from('pending_ingest').insert({
        user_id: source.user_id,
        data_source_id: source.id,
        sealed_payload: sealed,
        schema_type: def.schemaType,
        category: 'health',
        provider_record_id: record.providerRecordId,
        // A neutral placeholder for the queue. The real one is inside.
        label: `${def.label} record`,
        captured_at: record.capturedAt,
      })
      // 23505 is the idempotency guard doing its job: this record already
      // arrived on an earlier sync.
      if (error && (error as { code?: string }).code !== '23505') throw error
      if (!error) result.imported += 1
    } catch (error) {
      errorLogger.log(error, ErrorSeverity.LOW, {
        userId: source.user_id,
        action: 'CONNECTOR_SEAL_FAILED',
        resource: 'pending_ingest',
      })
      result.failed += 1
    }
  }

  await service
    .from('data_sources')
    .update({
      last_synced_at: new Date().toISOString(),
      status: 'connected',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id)

  if (result.imported > 0) {
    await createAuditEntry({
      userId: source.user_id,
      eventType: 'data_source_synced',
      action: `Imported ${result.imported} record(s) from ${def.label}`,
      actorType: 'system',
      metadata: { provider: source.provider, imported: result.imported },
    }).catch(() => undefined)
  }

  return result
}

async function markSourceError(sourceId: string, message: string): Promise<void> {
  const service = createServiceClient()
  await service
    .from('data_sources')
    .update({
      status: 'error',
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId)
    .then(undefined, () => undefined)
}

/**
 * Return a usable access token, refreshing first when it is close to expiry.
 * A failed refresh marks the source in error so the person sees a reconnect
 * prompt instead of silence.
 */
export async function ensureFreshToken(
  source: DataSource,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const expiresAt = source.token_expires_at ? new Date(source.token_expires_at).getTime() : null
  const needsRefresh =
    expiresAt !== null && expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS

  if (!needsRefresh) return readToken(source.encrypted_access_token)

  const refreshToken = readToken(source.encrypted_refresh_token)
  if (!refreshToken) throw new UserFacingError('Reconnect this source to continue syncing')

  const def = FITNESS_CONNECTORS[source.provider as FitnessProvider]
  const response = await fetchImpl(def.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env[def.clientIdEnv] ?? '',
      client_secret: process.env[def.clientSecretEnv] ?? '',
    }),
  })
  if (!response.ok) throw new UserFacingError('Reconnect this source to continue syncing')

  const body = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_at?: number
    expires_in?: number
  }

  const expiry = body.expires_at
    ? new Date(body.expires_at * 1000).toISOString()
    : body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null

  const access = wrapToken(body.access_token)
  const refresh = body.refresh_token ? wrapToken(body.refresh_token) : null
  const service = createServiceClient()
  await service
    .from('data_sources')
    .update({
      encrypted_access_token: `${access.iv}|${access.ciphertext}`,
      ...(refresh ? { encrypted_refresh_token: `${refresh.iv}|${refresh.ciphertext}` } : {}),
      token_expires_at: expiry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id)

  return body.access_token
}

interface NormalizedRecord {
  providerRecordId: string
  label: string
  capturedAt: string | null
  payload: Record<string, unknown>
}

async function fetchRecords(
  provider: ConnectorProvider,
  token: string,
  fetchImpl: typeof fetch
): Promise<NormalizedRecord[]> {
  if (provider === 'strava') {
    const response = await fetchImpl(
      'https://www.strava.com/api/v3/athlete/activities?per_page=30',
      { headers: { authorization: `Bearer ${token}` } }
    )
    if (!response.ok) throw new Error(`Strava returned ${response.status}`)
    const activities = (await response.json()) as (StravaActivity & { id?: number })[]
    return activities.map((activity, index) => ({
      // Strava numbers its activities. Falling back to the start date plus the
      // position keeps the idempotency key stable if a payload ever arrives
      // without an id, rather than importing the same run every sync.
      providerRecordId: String(activity.id ?? `${activity.start_date ?? 'unknown'}-${index}`),
      label: activity.name ?? 'Activity',
      capturedAt: activity.start_date ?? null,
      payload: normalizeStravaActivity(activity),
    }))
  }

  const day = new Date().toISOString().slice(0, 10)
  const response = await fetchImpl(
    `https://api.fitbit.com/1/user/-/activities/date/${day}.json`,
    { headers: { authorization: `Bearer ${token}` } }
  )
  if (!response.ok) throw new Error(`Fitbit returned ${response.status}`)
  const summary = (await response.json()) as FitbitDailySummary
  return [
    {
      providerRecordId: day,
      label: `Fitbit summary ${day}`,
      capturedAt: `${day}T00:00:00.000Z`,
      payload: normalizeFitbitDay(day, summary),
    },
  ]
}

/**
 * Sync every connected source that is due. Runs on the LD-601 scheduler, which
 * is why the whole path has to work without the person present.
 */
export async function runConnectorSync(
  fetchImpl: typeof fetch = fetch
): Promise<SyncResult> {
  const total: SyncResult = { imported: 0, failed: 0 }
  if (!isConnectorStorageConfigured()) return total

  const service = createServiceClient()
  const { data: sources, error } = await service
    .from('data_sources')
    .select('*')
    .eq('status', 'connected')
    .limit(100)
  if (error) throw error

  for (const source of sources ?? []) {
    const outcome = await syncSource(source as DataSource, fetchImpl).catch(() => ({
      imported: 0,
      failed: 1,
    }))
    total.imported += outcome.imported
    total.failed += outcome.failed
  }

  return total
}
