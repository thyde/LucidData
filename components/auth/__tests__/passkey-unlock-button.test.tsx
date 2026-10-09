import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const unlockWithPasskey = vi.fn()
const unlockWithKey = vi.fn()
const browserSupportsWebAuthn = vi.fn(() => true)

vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => browserSupportsWebAuthn() }))
vi.mock('@/lib/account/passkey-unlock', () => ({ unlockWithPasskey: () => unlockWithPasskey() }))
vi.mock('@/lib/context/encryption-context', () => ({ useEncryption: () => ({ unlockWithKey }) }))

const { PasskeyUnlockButton } = await import('@/components/auth/passkey-unlock-button')
const { PasskeyUnlockProvider } = await import('@/components/auth/passkey-unlock-provider')

function renderButton(available: boolean) {
  return render(
    <PasskeyUnlockProvider available={available}>
      <PasskeyUnlockButton />
    </PasskeyUnlockProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  browserSupportsWebAuthn.mockReturnValue(true)
})

describe('PasskeyUnlockButton', () => {
  it('shows nothing when no passkey can open the vault', () => {
    renderButton(false)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing outside the dashboard, where nobody has said a passkey can', () => {
    render(<PasskeyUnlockButton />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing in a browser without passkey support', () => {
    browserSupportsWebAuthn.mockReturnValue(false)
    renderButton(true)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the vault with the key the passkey unwraps', async () => {
    const key = { type: 'secret' } as CryptoKey
    unlockWithPasskey.mockResolvedValue(key)
    renderButton(true)

    await userEvent.click(await screen.findByRole('button', { name: 'Open with a passkey' }))

    await waitFor(() => expect(unlockWithKey).toHaveBeenCalledWith(key))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('points to the password when the passkey cannot open the vault', async () => {
    unlockWithPasskey.mockResolvedValue(null)
    renderButton(true)

    await userEvent.click(await screen.findByRole('button', { name: 'Open with a passkey' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with your password instead')
    expect(unlockWithKey).not.toHaveBeenCalled()
  })

  it('lets the person try again after cancelling the passkey prompt', async () => {
    unlockWithPasskey.mockRejectedValue(new Error('NotAllowedError'))
    renderButton(true)

    await userEvent.click(await screen.findByRole('button', { name: 'Open with a passkey' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The passkey was not used')
    expect(screen.getByRole('button', { name: 'Open with a passkey' })).toBeEnabled()
  })
})
