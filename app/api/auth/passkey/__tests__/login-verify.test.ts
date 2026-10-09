import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieValues = new Map<string, string>()
const verifyAuthenticationResponse = vi.fn()
const generateLink = vi.fn()

/** Challenges the server has issued and not yet used, by id. */
const issued = new Map<string, { challenge: string; userId: string; purpose: string }>()

/** The fake database: two accounts, each with its own passkey. */
const db = {
  users: [
    { id: 'victim-id', email: 'victim@example.com' },
    { id: 'attacker-id', email: 'attacker@example.com' },
  ],
  passkeys: [
    { id: 'pk-attacker', user_id: 'attacker-id', credential_id: 'attacker-cred', public_key: 'cHVi', counter: 1 },
    { id: 'pk-victim', user_id: 'victim-id', credential_id: 'victim-cred', public_key: 'cHVi', counter: 4 },
  ],
}
const updates: { payload: Record<string, unknown>; filters: Record<string, unknown> }[] = []

function find(name: 'users' | 'passkeys', filters: Record<string, unknown>) {
  return (
    (db[name] as Record<string, unknown>[]).find((row) =>
      Object.entries(filters).every(([column, value]) => row[column] === value)
    ) ?? null
  )
}

function table(name: 'users' | 'passkeys') {
  const filters: Record<string, unknown> = {}
  let payload: Record<string, unknown> | null = null
  const chain = {
    select: () => chain,
    update(values: Record<string, unknown>) {
      payload = values
      return chain
    },
    eq(column: string, value: unknown) {
      filters[column] = value
      return chain
    },
    async maybeSingle() {
      const row = find(name, filters)
      if (payload && row) {
        updates.push({ payload, filters: { ...filters } })
        Object.assign(row, payload)
      }
      // A copy, as a real read would return.
      return { data: row ? (payload ? { id: row.id } : { ...row }) : null, error: null }
    },
  }
  return chain
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined),
    delete: (name: string) => cookieValues.delete(name),
  }),
}))
vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: (...a: unknown[]) => verifyAuthenticationResponse(...a),
}))
vi.mock('@/lib/services/passkey-challenge.service', () => ({
  PASSKEY_CHALLENGE_COOKIE: 'passkey_challenge_id',
  // Deleted as it is read, like the real one.
  consumePasskeyChallenge: async (id: string, purpose: string) => {
    const entry = issued.get(id)
    if (!entry || entry.purpose !== purpose) return null
    issued.delete(id)
    return { challenge: entry.challenge, userId: entry.userId }
  },
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (name: 'users' | 'passkeys') => table(name),
    auth: { admin: { generateLink: (...a: unknown[]) => generateLink(...a) } },
  }),
}))

const { POST } = await import('@/app/api/auth/passkey/login-verify/route')

function post(credentialId: string) {
  return POST(
    new Request('http://localhost:3000/api/auth/passkey/login-verify', {
      method: 'POST',
      body: JSON.stringify({ credential: { id: credentialId, rawId: credentialId, response: {}, type: 'public-key' } }),
    }) as unknown as Parameters<typeof POST>[0]
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  db.passkeys[0].counter = 1
  db.passkeys[1].counter = 4
  issued.clear()
  issued.set('challenge-1', { challenge: 'Y2hhbGxlbmdl', userId: 'victim-id', purpose: 'authentication' })
  cookieValues.clear()
  cookieValues.set('passkey_challenge_id', 'challenge-1')
  verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 5 } })
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hashed-token' } }, error: null })
})

describe('passkey sign-in verification', () => {
  it('refuses a passkey registered to another account, and gives out no link', async () => {
    // The attacker signs the victim's challenge with their own, genuine passkey.
    const res = await post('attacker-cred')

    expect(res.status).toBe(400)
    expect(await res.json()).not.toHaveProperty('token_hash')
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
    expect(generateLink).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('gives the owner a single-use link for their own account', async () => {
    const res = await post('victim-cred')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ verified: true, token_hash: 'hashed-token' })
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'Y2hhbGxlbmdl',
        credential: expect.objectContaining({ id: 'victim-cred', counter: 4 }),
      })
    )
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'victim@example.com' })
    expect(updates).toEqual([
      {
        payload: expect.objectContaining({ counter: 5, last_used_at: expect.any(String) }),
        filters: { id: 'pk-victim', user_id: 'victim-id', counter: 4 },
      },
    ])
    expect(cookieValues.size).toBe(0)
  })

  it('refuses the same request a second time, even with the cookie put back', async () => {
    expect((await post('victim-cred')).status).toBe(200)

    cookieValues.set('passkey_challenge_id', 'challenge-1')
    const replay = await post('victim-cred')

    expect(replay.status).toBe(400)
    expect(await replay.json()).not.toHaveProperty('token_hash')
    expect(generateLink).toHaveBeenCalledTimes(1)
  })

  it('ignores the old cookies, which carried the challenge and the email themselves', async () => {
    cookieValues.clear()
    cookieValues.set('passkey_challenge', 'Y2hhbGxlbmdl')
    cookieValues.set('passkey_email', 'victim@example.com')

    expect((await post('victim-cred')).status).toBe(400)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('refuses a challenge issued for registering a passkey', async () => {
    issued.set('challenge-1', { challenge: 'Y2hhbGxlbmdl', userId: 'victim-id', purpose: 'registration' })

    expect((await post('victim-cred')).status).toBe(400)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('refuses when another sign-in moved the counter on first', async () => {
    verifyAuthenticationResponse.mockImplementation(async () => {
      db.passkeys[1].counter = 6
      return { verified: true, authenticationInfo: { newCounter: 5 } }
    })

    expect((await post('victim-cred')).status).toBe(400)
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('refuses a signature that does not verify', async () => {
    verifyAuthenticationResponse.mockResolvedValue({ verified: false })

    expect((await post('victim-cred')).status).toBe(400)
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('refuses a malformed signature', async () => {
    verifyAuthenticationResponse.mockRejectedValue(new Error('Unexpected authenticator data'))

    expect((await post('victim-cred')).status).toBe(400)
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('refuses without a challenge from this browser', async () => {
    cookieValues.clear()

    expect((await post('victim-cred')).status).toBe(400)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('reports a link that could not be made', async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: 'User not found' } })

    const res = await post('victim-cred')

    expect(res.status).toBe(500)
    expect(await res.json()).not.toHaveProperty('token_hash')
  })
})
