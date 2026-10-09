import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignOutButton } from '@/components/auth/sign-out-button'

const replace = vi.fn()
const fetchMock = vi.fn()
const realLocation = window.location

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom's location cannot navigate, so the test only records where it went.
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, replace } })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const name of ['sb-ref-auth-token', 'sb-ref-auth-token.0', 'theme']) document.cookie = `${name}=; Max-Age=0; path=/`
})

function setSessionCookies() {
  document.cookie = 'sb-ref-auth-token=base64-session; path=/'
  document.cookie = 'sb-ref-auth-token.0=chunk; path=/'
  document.cookie = 'theme=dark; path=/'
}

async function signOut() {
  render(<SignOutButton />)
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
}

describe('SignOutButton', () => {
  it('signs out on the server, then leaves with a full page load', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    setSessionCookies()

    await signOut()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' })
    // The server clears its own cookies when it signs out.
    expect(document.cookie).toContain('sb-ref-auth-token=base64-session')
  })

  it('still leaves when the session had already ended, so nothing decrypted stays', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))

    await signOut()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
  })

  it('still leaves when the request fails outright, and this browser forgets the session', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    setSessionCookies()

    await signOut()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    expect(document.cookie).not.toContain('sb-ref-auth-token')
    // Only the session's cookies go.
    expect(document.cookie).toContain('theme=dark')
  })
})
