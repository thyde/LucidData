import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-201: the sync worker writes ciphertext it cannot read. These assert the
 * two properties that make that true in practice, not just in the crypto
 * module: a sync refuses to run without somewhere sealed to put the result, and
 * re-running never duplicates a record.
 */

process.env.CONNECTOR_TOKEN_SECRET = Buffer.alloc(32, 3).toString('base64')
process.env.STRAVA_CLIENT_ID = 'strava-client'
process.env.STRAVA_CLIENT_SECRET = 'strava-secret'

interface Call {
  table: string
  op: string
  patch?: Record<string, unknown>
  row?: Record<string, unknown>
}

const calls: Call[] = []
const rowsByTable = new Map<string, Record<string, unknown>[]>()
const insertErrors: (Record<string, unknown> | null)[] = []
const failingDeletes = new Set<string>()
const failingSelects = new Set<string>()
const filters: { table: string; column: string; value: unknown }[] = []
const createAuditEntry = vi.fn()

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: vi.fn() },
}))

function chain(table: string, op: string, patch?: Record<string, unknown>) {
  calls.push({ table, op, patch })
  const settle = () => ({
    data: rowsByTable.get(table) ?? [],
    error:
      (op === 'delete' && failingDeletes.has(table)) || (op === 'select' && failingSelects.has(table))
        ? { message: `${op} refused` }
        : null,
  })
  const api = {
    eq: (column: string, value: unknown) => {
      filters.push({ table, column, value })
      return api
    },
    in: (column: string, value: unknown) => {
      filters.push({ table, column, value })
      return api
    },
    limit: () => api,
    order: () => api,
    select: () => api,
    single: () =>
      Promise.resolve({ data: (rowsByTable.get(table) ?? [])[0] ?? null, error: null }),
    maybeSingle: () =>
      Promise.resolve({ data: (rowsByTable.get(table) ?? [])[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
  }
  return api
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      update: (patch: Record<string, unknown>) => chain(table, 'update', patch),
      delete: () => chain(table, 'delete'),
      upsert: (row: Record<string, unknown>) => {
        calls.push({ table, op: 'upsert', row })
        return {
          select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
        }
      },
      insert: (row: Record<string, unknown>) => {
        calls.push({ table, op: 'insert', row })
        const error = insertErrors.length > 0 ? insertErrors.shift() : null
        return Promise.resolve({ data: null, error })
      },
    }),
  }),
}))

const { syncSource, ensureFreshToken, availableConnectors, disconnectSource, TOKEN_REFRESH_MARGIN_MS } =
  await import('@/lib/services/connector.service')
const { generateIngestionKeypair, openSealed } = await import(
  '@luciddata/core/crypto/ingestion-keys'
)
const { wrapToken } = await import('@/lib/services/connector-tokens')

function storedToken(token: string): string {
  const wrapped = wrapToken(token)
  return `${wrapped.iv}|${wrapped.ciphertext}`
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    user_id: 'user-1',
    provider: 'strava',
    status: 'connected',
    scopes: ['activity:read_all'],
    encrypted_access_token: storedToken('access-token'),
    encrypted_refresh_token: storedToken('refresh-token'),
    token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    provider_account_id: null,
    last_synced_at: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as any
}

const ACTIVITIES = [
  {
    id: 111,
    name: 'Morning run',
    sport_type: 'Run',
    start_date: '2026-07-01T06:00:00Z',
    distance: 5000,
    moving_time: 1800,
  },
]

function fetchReturning(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 401,
      json: async () => payload,
    }) as any) as unknown as typeof fetch
}

beforeEach(() => {
  calls.length = 0
  rowsByTable.clear()
  insertErrors.length = 0
  failingDeletes.clear()
  failingSelects.clear()
  filters.length = 0
  vi.clearAllMocks()
  createAuditEntry.mockResolvedValue(undefined)
})

describe('disconnecting a source', () => {
  it('deletes imported records when asked, and records that it did', async () => {
    rowsByTable.set('data_sources', [source({ provider: 'fitbit' })])

    await disconnectSource('user-1', 'source-1', { deleteImported: true })

    expect(calls.some((call) => call.table === 'vault_data' && call.op === 'delete')).toBe(true)
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'data_source_disconnected',
        metadata: expect.objectContaining({ deleted_imported: true }),
      })
    )
  })

  it('does not record a deletion that failed', async () => {
    rowsByTable.set('data_sources', [source({ provider: 'fitbit' })])
    failingDeletes.add('vault_data')

    await expect(
      disconnectSource('user-1', 'source-1', { deleteImported: true })
    ).rejects.toMatchObject({ message: 'delete refused' })
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('a sync without an ingestion key', () => {
  it('refuses to store anything rather than storing it readable', async () => {
    rowsByTable.set('users', [{ ingest_public_key: null }])
    const result = await syncSource(source(), fetchReturning(ACTIVITIES))

    expect(result.imported).toBe(0)
    // Nothing was written to the queue at all.
    expect(calls.some((call) => call.table === 'pending_ingest' && call.op === 'insert')).toBe(
      false
    )
    const marked = calls.find((call) => call.table === 'data_sources' && call.op === 'update')
    expect(marked?.patch?.status).toBe('error')
    expect(String(marked?.patch?.last_error)).toContain('unlocked')
  })
})

describe('a sync with an ingestion key', () => {
  it('writes only sealed payloads, which it cannot itself read', async () => {
    const pair = await generateIngestionKeypair()
    rowsByTable.set('users', [{ ingest_public_key: pair.publicKeyB64 }])

    const result = await syncSource(source(), fetchReturning(ACTIVITIES))
    expect(result.imported).toBe(1)

    const insert = calls.find(
      (call) => call.table === 'pending_ingest' && call.op === 'insert'
    )
    const sealed = String(insert?.row?.sealed_payload)

    // The row the worker wrote holds no readable trace of the activity. The
    // provider's own name for it is an identifier, so it is sealed too and the
    // queue row carries a neutral placeholder.
    expect(JSON.stringify(insert?.row)).not.toContain('Morning run')
    expect(insert?.row?.label).toBe('Strava record')
    expect(sealed).not.toContain('5000')

    // And it opens only with the private half, which the worker never had.
    const opened = JSON.parse(await openSealed(pair.privateKeyB64, sealed))
    expect(opened.distance_km).toBeCloseTo(5)
    expect(opened.__label).toBe('Morning run')
  })

  it('records the provider id so a repeated sync is a no-op', async () => {
    const pair = await generateIngestionKeypair()
    rowsByTable.set('users', [{ ingest_public_key: pair.publicKeyB64 }])
    await syncSource(source(), fetchReturning(ACTIVITIES))

    const insert = calls.find(
      (call) => call.table === 'pending_ingest' && call.op === 'insert'
    )
    expect(insert?.row?.provider_record_id).toBe('111')
    expect(insert?.row?.schema_type).toBe('fitness_activity')
  })

  it('does not queue again a record the vault already holds', async () => {
    // The drain cleared the queue row after storing it, so only the vault can
    // say it has arrived. Queuing it again would report an import that never
    // happened, on every sync.
    const pair = await generateIngestionKeypair()
    rowsByTable.set('users', [{ ingest_public_key: pair.publicKeyB64 }])
    rowsByTable.set('vault_data', [{ source_record_id: '111' }])

    const result = await syncSource(source(), fetchReturning(ACTIVITIES))

    expect(result).toEqual({ imported: 0, failed: 0 })
    expect(calls.some((call) => call.table === 'pending_ingest' && call.op === 'insert')).toBe(false)
    expect(createAuditEntry).not.toHaveBeenCalled()
    // Only what the connector stored. An archive import is its own source,
    // kept when the connector is disconnected, and the timeline matches the two.
    expect(filters).toContainEqual({ table: 'vault_data', column: 'source_provider', value: 'strava' })
  })

  it('leaves the source connected when the vault check fails, so the next run retries', async () => {
    const pair = await generateIngestionKeypair()
    rowsByTable.set('users', [{ ingest_public_key: pair.publicKeyB64 }])
    failingSelects.add('vault_data')

    await expect(syncSource(source(), fetchReturning(ACTIVITIES))).rejects.toBeTruthy()
    expect(calls.some((call) => call.table === 'pending_ingest' && call.op === 'insert')).toBe(false)
    expect(calls.some((call) => call.table === 'data_sources' && call.op === 'update')).toBe(false)
  })

  it('treats a duplicate as already imported rather than as a failure', async () => {
    const pair = await generateIngestionKeypair()
    rowsByTable.set('users', [{ ingest_public_key: pair.publicKeyB64 }])
    // 23505 is the unique index on (data_source_id, provider_record_id).
    insertErrors.push({ code: '23505', message: 'duplicate key' })

    const result = await syncSource(source(), fetchReturning(ACTIVITIES))
    expect(result.imported).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('marks the source in error when the provider refuses', async () => {
    const pair = await generateIngestionKeypair()
    rowsByTable.set('users', [{ ingest_public_key: pair.publicKeyB64 }])

    const result = await syncSource(source(), fetchReturning({}, false))
    expect(result.imported).toBe(0)
    const marked = calls.find((call) => call.table === 'data_sources' && call.op === 'update')
    expect(marked?.patch?.status).toBe('error')
  })
})

describe('a retired provider', () => {
  it('is never offered, even when its credentials are configured', () => {
    process.env.FITBIT_CLIENT_ID = 'fitbit-client'
    process.env.FITBIT_CLIENT_SECRET = 'fitbit-secret'
    try {
      const offered = availableConnectors().map((entry) => entry.id)
      expect(offered).toContain('strava')
      expect(offered).not.toContain('fitbit')
    } finally {
      delete process.env.FITBIT_CLIENT_ID
      delete process.env.FITBIT_CLIENT_SECRET
    }
  })

  it('stops syncing and says why, before touching keys or the provider', async () => {
    const fetchImpl = vi.fn()
    const result = await syncSource(
      source({ provider: 'fitbit' }),
      fetchImpl as unknown as typeof fetch
    )

    expect(result).toEqual({ imported: 0, failed: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(calls.some((call) => call.table === 'users')).toBe(false)
    expect(calls.some((call) => call.table === 'pending_ingest')).toBe(false)
    const marked = calls.find((call) => call.table === 'data_sources' && call.op === 'update')
    expect(marked?.patch?.status).toBe('error')
    expect(String(marked?.patch?.last_error)).toContain('Fitbit Web API')
  })
})

describe('token refresh', () => {
  it('leaves a token alone while it is still good', async () => {
    const token = await ensureFreshToken(
      source({ token_expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
      fetchReturning({})
    )
    expect(token).toBe('access-token')
  })

  it('refreshes before expiry rather than after a failed call', async () => {
    const refreshed = await ensureFreshToken(
      source({
        token_expires_at: new Date(Date.now() + TOKEN_REFRESH_MARGIN_MS / 2).toISOString(),
      }),
      fetchReturning({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 })
    )
    expect(refreshed).toBe('new-access')

    const update = calls.find((call) => call.table === 'data_sources' && call.op === 'update')
    // The stored form must still be wrapped, never the raw token.
    expect(String(update?.patch?.encrypted_access_token)).not.toContain('new-access')
  })

  it('asks the person to reconnect when the refresh is rejected', async () => {
    await expect(
      ensureFreshToken(
        source({ token_expires_at: new Date().toISOString() }),
        fetchReturning({}, false)
      )
    ).rejects.toThrow(/Reconnect/)
  })

  it('asks the person to reconnect when there is no refresh token', async () => {
    await expect(
      ensureFreshToken(
        source({
          token_expires_at: new Date().toISOString(),
          encrypted_refresh_token: null,
        }),
        fetchReturning({})
      )
    ).rejects.toThrow(/Reconnect/)
  })
})
