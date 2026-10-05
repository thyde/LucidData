import { describe, it, expect, beforeEach, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signOut = vi.fn()
const createClient = vi.fn<(url: string, key: string, options: unknown) => unknown>(() => ({
  auth: { signInWithPassword, signOut },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options: unknown) => createClient(url, key, options),
}))

const { verifyPassword, createPasswordProof } = await import('@/lib/supabase/verify-password')

const session = { access_token: 'fresh-access-token', refresh_token: 'refresh' }

beforeEach(() => {
  createClient.mockClear()
  signInWithPassword.mockReset().mockResolvedValue({ data: { session }, error: null })
  signOut.mockReset().mockResolvedValue({ error: null })
})

describe('verifyPassword', () => {
  it('sends the CAPTCHA token with the sign-in', async () => {
    await verifyPassword('a@example.com', 'correct horse', 'captcha-token')

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'correct horse',
      options: { captchaToken: 'captcha-token' },
    })
  })

  it('checks on a client that stores nothing, so the live session is untouched', async () => {
    await verifyPassword('a@example.com', 'correct horse')

    const options = createClient.mock.calls[0][2] as { auth: Record<string, unknown> }
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false })
  })

  it('ends only its own session after a successful check', async () => {
    await expect(verifyPassword('a@example.com', 'correct horse')).resolves.toBe(true)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('returns false for a wrong password', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    await expect(verifyPassword('a@example.com', 'wrong')).resolves.toBe(false)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('reports a CAPTCHA refusal instead of calling the password wrong', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: {
        code: 'captcha_failed',
        message: 'captcha protection: request disallowed (invalid-input-response)',
      },
    })

    await expect(verifyPassword('a@example.com', 'correct horse')).rejects.toThrow(/captcha/i)
  })
})

describe('createPasswordProof', () => {
  it('hands back the fresh access token and leaves that session for the server to end', async () => {
    await expect(createPasswordProof('a@example.com', 'correct horse', 'captcha-token')).resolves.toBe(
      'fresh-access-token'
    )
    expect(signOut).not.toHaveBeenCalled()
  })

  it('returns null for a wrong password', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    await expect(createPasswordProof('a@example.com', 'wrong')).resolves.toBeNull()
  })
})
