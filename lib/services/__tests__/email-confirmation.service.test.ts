import { describe, it, expect, beforeEach, vi } from 'vitest'

const verifyOtp = vi.fn()
const signOut = vi.fn()
const createClient = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    createClient(...args)
    return { auth: { verifyOtp, signOut } }
  },
}))

const { confirmEmailAddress } = await import('@/lib/services/email-confirmation.service')

beforeEach(() => {
  vi.clearAllMocks()
  signOut.mockResolvedValue({ error: null })
})

describe('confirmEmailAddress', () => {
  it('verifies the link on a client that keeps no session', async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null })
    await confirmEmailAddress('hash-1', 'email')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'email' })
    const options = createClient.mock.calls[0][2] as { auth: Record<string, boolean> }
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    })
  })

  it('ends the session the link created, so the password is still needed', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 't' } },
      error: null,
    })
    expect(await confirmEmailAddress('hash-1', 'email')).toBe(true)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('still reports success if ending that session fails', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 't' } },
      error: null,
    })
    signOut.mockRejectedValue(new Error('network'))
    expect(await confirmEmailAddress('hash-1', 'signup')).toBe(true)
  })

  it('reports an expired or reused link as a failure', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'otp_expired', message: 'Email link is invalid or has expired' },
    })
    expect(await confirmEmailAddress('used', 'email')).toBe(false)
    expect(signOut).not.toHaveBeenCalled()
  })
})
