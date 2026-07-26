import { describe, it, expect, beforeEach, vi } from 'vitest'

const stepUpUpdate = vi.fn()
const stepUpInsert = vi.fn()
const revokedUpsert = vi.fn()
const revokedSelect = vi.fn()
const rpc = vi.fn()
const createAuditEntry = vi.fn()
const getSession = vi.fn()

type Stubbed = ReturnType<typeof vi.fn> & { result?: { data: unknown; error: null } }

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain = {
        insert: (payload: unknown) => {
          if (table === 'step_up_grants') stepUpInsert(payload)
          return Promise.resolve({ error: null })
        },
        upsert: (payload: unknown) => {
          revokedUpsert(payload)
          return Promise.resolve({ error: null })
        },
        update: (payload: unknown) => {
          stepUpUpdate(payload)
          return chain
        },
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        gt: () => chain,
        maybeSingle: () =>
          Promise.resolve(
            table === 'revoked_sessions'
              ? revokedSelect()
              : (stepUpUpdate as Stubbed).result ?? { data: null, error: null }
          ),
      }
      return chain
    },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getSession: () => Promise.resolve(getSession()) },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}))

const {
  STEP_UP_ACTIONS,
  STEP_UP_TTL_SECONDS,
  isStepUpAction,
  grantStepUp,
  consumeStepUp,
  revokeSession,
  isSessionRevoked,
  decodeSessionId,
  listSessions,
} = await import('@/lib/services/session-security.service')

function jwtWithSessionId(sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')
  return `header.${payload}.signature`
}

beforeEach(() => {
  stepUpUpdate.mockReset()
  stepUpInsert.mockReset()
  revokedUpsert.mockReset()
  revokedSelect.mockReset().mockReturnValue({ data: null, error: null })
  rpc.mockReset().mockResolvedValue({ data: [], error: null })
  createAuditEntry.mockReset().mockResolvedValue(undefined)
  getSession.mockReset().mockReturnValue({ data: { session: null } })
  ;(stepUpUpdate as Stubbed).result = { data: { id: 'grant-1' }, error: null }
})

describe('step-up actions', () => {
  it('covers every action the roadmap requires fresh authentication for', () => {
    for (const action of [
      'export_vault',
      'revoke_consent',
      'change_password',
      'add_recovery_factor',
      'delete_account',
    ]) {
      expect(STEP_UP_ACTIONS).toContain(action)
    }
  })

  it('rejects an unknown action name', () => {
    expect(isStepUpAction('delete_account')).toBe(true)
    expect(isStepUpAction('drop_everything')).toBe(false)
  })

  it('mints a short-lived grant bound to one action', async () => {
    const token = await grantStepUp('user-1', 'delete_account')

    expect(token).toEqual(expect.any(String))
    const payload = stepUpInsert.mock.calls[0][0] as Record<string, string>
    expect(payload.action).toBe('delete_account')
    expect(payload.user_id).toBe('user-1')
    // Only the hash is stored, never the token itself.
    expect(payload.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(payload)).not.toContain(token)

    const ttlMs = new Date(payload.expires_at).getTime() - Date.now()
    expect(ttlMs).toBeLessThanOrEqual(STEP_UP_TTL_SECONDS * 1000 + 1000)
    expect(ttlMs).toBeGreaterThan(0)
  })

  it('consumes a valid grant exactly once', async () => {
    await expect(consumeStepUp('user-1', 'delete_account', 'token')).resolves.toBeUndefined()
    expect(stepUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ consumed_at: expect.any(String) })
    )
  })

  it('rejects a replayed or expired grant and audits the failure', async () => {
    ;(stepUpUpdate as Stubbed).result = { data: null, error: null }

    await expect(consumeStepUp('user-1', 'delete_account', 'token')).rejects.toThrow(
      /Confirm your password/i
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_failed', success: false })
    )
  })

  it('does not accept a grant issued for a different action', async () => {
    // The query filters on action, so a mismatch resolves to no row.
    ;(stepUpUpdate as Stubbed).result = { data: null, error: null }
    await expect(consumeStepUp('user-1', 'export_vault', 'token')).rejects.toThrow()
  })
})

describe('decodeSessionId', () => {
  it('reads the session id claim from an access token', () => {
    expect(decodeSessionId(jwtWithSessionId('abc-123'))).toBe('abc-123')
  })

  it('returns null for anything that is not a token', () => {
    expect(decodeSessionId(null)).toBeNull()
    expect(decodeSessionId('not-a-jwt')).toBeNull()
    expect(decodeSessionId('a.b.c')).toBeNull()
  })
})

describe('revokeSession', () => {
  it('records the revocation and deletes the auth session', async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    await revokeSession('user-1', '11111111-1111-4111-8111-111111111111')

    expect(revokedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
      })
    )
    expect(rpc).toHaveBeenCalledWith('revoke_my_session', {
      p_session_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'session_revoked' })
    )
  })
})

describe('isSessionRevoked', () => {
  it('reports a revoked session', async () => {
    revokedSelect.mockReturnValue({ data: { session_id: 's1' }, error: null })
    await expect(isSessionRevoked('s1')).resolves.toBe(true)
  })

  it('reports an unknown session as not revoked', async () => {
    await expect(isSessionRevoked('s2')).resolves.toBe(false)
  })
})

describe('listSessions', () => {
  it('marks the caller device as current', async () => {
    getSession.mockReturnValue({
      data: { session: { access_token: jwtWithSessionId('session-a') } },
    })
    rpc.mockResolvedValue({
      data: [
        {
          id: 'session-a',
          created_at: '2026-07-25T00:00:00.000Z',
          updated_at: '2026-07-25T01:00:00.000Z',
          user_agent: 'Mozilla/5.0 (Macintosh)',
          ip: '203.0.113.5',
        },
        {
          id: 'session-b',
          created_at: '2026-07-20T00:00:00.000Z',
          updated_at: null,
          user_agent: null,
          ip: null,
        },
      ],
      error: null,
    })

    const sessions = await listSessions('user-1')

    expect(sessions).toHaveLength(2)
    expect(sessions[0].current).toBe(true)
    expect(sessions[1].current).toBe(false)
  })

  it('degrades to the current session when the lookup fails', async () => {
    getSession.mockReturnValue({
      data: { session: { access_token: jwtWithSessionId('session-a') } },
    })
    rpc.mockResolvedValue({ data: null, error: new Error('not available') })

    const sessions = await listSessions('user-1')
    expect(sessions).toEqual([expect.objectContaining({ id: 'session-a', current: true })])
  })
})
