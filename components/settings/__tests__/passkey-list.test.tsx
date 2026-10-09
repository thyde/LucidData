import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = vi.fn()
const toast = vi.fn()
const stepUpWithPassword = vi.fn()
const enablePasskeyUnlock = vi.fn()
const removeRecoveryFactorAction = vi.fn()
const removePasskeyAction = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/lib/hooks/use-turnstile', () => ({
  useTurnstile: () => ({ attach: () => undefined, getToken: async () => 'captcha' }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { email: 'ada@example.com' } } }) } }),
}))
vi.mock('@/lib/account/step-up', () => ({ stepUpWithPassword: (...a: unknown[]) => stepUpWithPassword(...a) }))
vi.mock('@/lib/account/passkey-unlock', () => ({
  enablePasskeyUnlock: (...a: unknown[]) => enablePasskeyUnlock(...a),
}))
vi.mock('@/lib/actions/recovery.actions', () => ({
  removeRecoveryFactorAction: (...a: unknown[]) => removeRecoveryFactorAction(...a),
}))
vi.mock('@/lib/actions/account.actions', () => ({
  removePasskeyAction: (...a: unknown[]) => removePasskeyAction(...a),
}))
// The real dialog checks the password itself. Here it only hands over a grant.
vi.mock('@/components/auth/step-up-dialog', () => ({
  StepUpDialog: ({
    open,
    title,
    onConfirmed,
  }: {
    open: boolean
    title: string
    onConfirmed: (token: string) => Promise<void>
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={() => onConfirmed('grant')}>
          Confirm
        </button>
      </div>
    ) : null,
}))

const { PasskeyList } = await import('@/components/settings/passkey-list')

const laptop = {
  id: 'pk-1',
  credential_id: 'cred-1',
  device_name: 'Laptop',
  created_at: '2026-10-01T00:00:00.000Z',
  last_used_at: null,
  unlock_factor_id: null,
}
const phone = {
  id: 'pk-2',
  credential_id: 'cred-2',
  device_name: 'Phone',
  created_at: '2026-10-02T00:00:00.000Z',
  last_used_at: '2026-10-03T00:00:00.000Z',
  unlock_factor_id: 'factor-2',
}

beforeEach(() => {
  vi.clearAllMocks()
  stepUpWithPassword.mockResolvedValue('grant')
  enablePasskeyUnlock.mockResolvedValue(true)
  removeRecoveryFactorAction.mockResolvedValue(undefined)
})

async function startEnabling() {
  render(<PasskeyList passkeys={[laptop, phone]} keySalt="a2V5LXNhbHQ=" />)
  await userEvent.click(screen.getByRole('button', { name: 'Open the vault with it' }))
  await userEvent.type(screen.getByLabelText('Password'), 'hunter22-but-longer')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('PasskeyList', () => {
  it('says which passkeys open the vault and offers the rest', () => {
    render(<PasskeyList passkeys={[laptop, phone]} keySalt="a2V5LXNhbHQ=" />)

    expect(screen.getAllByText('Opens your vault')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open the vault with it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop opening the vault' })).toBeInTheDocument()
  })

  it('confirms the password, then lets the passkey open the vault', async () => {
    await startEnabling()

    await waitFor(() => expect(enablePasskeyUnlock).toHaveBeenCalled())
    expect(stepUpWithPassword).toHaveBeenCalledWith('add_recovery_factor', 'ada@example.com', 'hunter22-but-longer', 'captcha')
    expect(enablePasskeyUnlock).toHaveBeenCalledWith({
      passkeyId: 'pk-1',
      credentialId: 'cred-1',
      password: 'hunter22-but-longer',
      keySalt: 'a2V5LXNhbHQ=',
      stepUpToken: 'grant',
    })
    expect(toast).toHaveBeenCalledWith({ title: 'Laptop can now open your vault' })
    expect(refresh).toHaveBeenCalled()
  })

  it('stops at a wrong password without asking for the passkey', async () => {
    stepUpWithPassword.mockResolvedValue(null)

    await startEnabling()

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password')
    expect(enablePasskeyUnlock).not.toHaveBeenCalled()
  })

  it('explains when the device cannot use the passkey to open the vault', async () => {
    enablePasskeyUnlock.mockResolvedValue(false)

    await startEnabling()

    expect(await screen.findByRole('alert')).toHaveTextContent('does not support it')
    expect(toast).not.toHaveBeenCalled()
  })

  it('shows why the copy could not be made', async () => {
    enablePasskeyUnlock.mockRejectedValue(new Error('Your password does not open your vault as it is now.'))

    await startEnabling()

    expect(await screen.findByRole('alert')).toHaveTextContent('Your password does not open your vault as it is now.')
  })

  it('removes the passkey copy after a fresh password check', async () => {
    render(<PasskeyList passkeys={[laptop, phone]} keySalt="a2V5LXNhbHQ=" />)

    await userEvent.click(screen.getByRole('button', { name: 'Stop opening the vault' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(removeRecoveryFactorAction).toHaveBeenCalledWith({ factorId: 'factor-2', stepUpToken: 'grant' })
    )
    expect(toast).toHaveBeenCalledWith({ title: 'Phone no longer opens your vault' })
    expect(refresh).toHaveBeenCalled()
  })

  it('reports a failed change after the password dialog has closed', async () => {
    removeRecoveryFactorAction.mockRejectedValue(new Error('Recovery factor not found'))
    render(<PasskeyList passkeys={[laptop, phone]} keySalt="a2V5LXNhbHQ=" />)

    await userEvent.click(screen.getByRole('button', { name: 'Stop opening the vault' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Could not change this passkey',
        description: 'Recovery factor not found',
        variant: 'destructive',
      })
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('warns that removing a passkey that opens the vault stops that too', async () => {
    render(<PasskeyList passkeys={[laptop, phone]} keySalt="a2V5LXNhbHQ=" />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Phone' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('sign in with its passkey or open your vault')
  })
})
