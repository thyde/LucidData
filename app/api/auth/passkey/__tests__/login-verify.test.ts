import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieValues = new Map<string, string>()
const verifyAuthenticationResponse = vi.fn()
const generateLink = vi.fn()

/** The fake database: one account per email, and the passkeys each owns. */
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
const updates: { table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }[] = []

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
    maybeSingle: async () => ({
      data:
        (db[name] as Record<string, unknown>[]).find((row) =>
          Object.entries(filters).every(([column, value]) => row[column] === value)
        ) ?? null,
      error: null,
    }),
    then(resolve: (value: unknown) => unknown) {
      if (payload) updates.push({ table: name, payload, filters: { ...filters } })
      return Promise.resolve({ error: null }).then(resolve)
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
  cookieValues.clear()
  cookieValues.set('passkey_challenge', 'challenge-1')
  cookieValues.set('passkey_email', 'victim@example.com')
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
        expectedChallenge: 'challenge-1',
        credential: expect.objectContaining({ id: 'victim-cred', counter: 4 }),
      })
    )
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'victim@example.com' })
    expect(updates).toEqual([
      {
        table: 'passkeys',
        payload: expect.objectContaining({ counter: 5, last_used_at: expect.any(String) }),
        filters: { id: 'pk-victim', user_id: 'victim-id' },
      },
    ])
    // The challenge works once.
    expect(cookieValues.size).toBe(0)
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

  it('refuses an email with no account', async () => {
    cookieValues.set('passkey_email', 'nobody@example.com')

    expect((await post('victim-cred')).status).toBe(400)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('refuses without a challenge from this browser', async () => {
    cookieValues.delete('passkey_challenge')

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
