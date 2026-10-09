import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieValues = new Map<string, string>()
const verifyRegistrationResponse = vi.fn()
const insertPasskey = vi.fn()
const issued = new Map<string, { challenge: string; userId: string; purpose: string }>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined),
    delete: (name: string) => cookieValues.delete(name),
  }),
}))
vi.mock('@simplewebauthn/server', () => ({
  verifyRegistrationResponse: (...a: unknown[]) => verifyRegistrationResponse(...a),
}))
vi.mock('@/lib/middleware/withAuth', () => ({
  withAuth:
    (handler: (req: Request, context: { userId: string; userEmail: string }) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { userId: 'user-1', userEmail: 'ada@example.com' }),
}))
vi.mock('@/lib/services/passkey-challenge.service', () => ({
  PASSKEY_CHALLENGE_COOKIE: 'passkey_challenge_id',
  consumePasskeyChallenge: async (id: string, purpose: string) => {
    const entry = issued.get(id)
    if (!entry || entry.purpose !== purpose) return null
    issued.delete(id)
    return { challenge: entry.challenge, userId: entry.userId }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ insert: (row: Record<string, unknown>) => Promise.resolve(insertPasskey(row)) }),
  }),
}))

const { POST } = await import('@/app/api/auth/passkey/register-verify/route')

function post() {
  return (POST as unknown as (req: Request) => Promise<Response>)(
    new Request('http://localhost:3000/api/auth/passkey/register-verify', {
      method: 'POST',
      body: JSON.stringify({ credential: { id: 'new-cred' }, deviceName: 'Laptop' }),
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  issued.clear()
  issued.set('challenge-1', { challenge: 'cmVnaXN0ZXI', userId: 'user-1', purpose: 'registration' })
  cookieValues.clear()
  cookieValues.set('passkey_challenge_id', 'challenge-1')
  insertPasskey.mockReturnValue({ error: null })
  verifyRegistrationResponse.mockResolvedValue({
    verified: true,
    registrationInfo: { credential: { id: 'new-cred', publicKey: new Uint8Array([1, 2, 3]), counter: 0 } },
  })
})

describe('passkey registration', () => {
  it('registers against the challenge issued to this account', async () => {
    const res = await post()

    expect(res.status).toBe(200)
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({ expectedChallenge: 'cmVnaXN0ZXI' }))
    expect(insertPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', credential_id: 'new-cred', device_name: 'Laptop' })
    )
    expect(cookieValues.size).toBe(0)
  })

  it('refuses a challenge issued to another account', async () => {
    issued.set('challenge-1', { challenge: 'cmVnaXN0ZXI', userId: 'someone-else', purpose: 'registration' })

    expect((await post()).status).toBe(400)
    expect(verifyRegistrationResponse).not.toHaveBeenCalled()
    expect(insertPasskey).not.toHaveBeenCalled()
  })

  it('refuses a challenge issued for signing in', async () => {
    issued.set('challenge-1', { challenge: 'cmVnaXN0ZXI', userId: 'user-1', purpose: 'authentication' })

    expect((await post()).status).toBe(400)
    expect(verifyRegistrationResponse).not.toHaveBeenCalled()
  })

  it('uses a challenge once', async () => {
    expect((await post()).status).toBe(200)
    cookieValues.set('passkey_challenge_id', 'challenge-1')

    expect((await post()).status).toBe(400)
    expect(insertPasskey).toHaveBeenCalledTimes(1)
  })
})
