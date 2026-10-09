import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const updateUser = vi.fn()
const unlock = vi.fn()
const stepUpWithPassword = vi.fn()
const unlockWithPasskey = vi.fn()
const getPasskeyUnlockMaterialAction = vi.fn()
const getRecoveryMaterialAction = vi.fn()
const retirePasskeyUnlocksAction = vi.fn()
const prepareRewrap = vi.fn()
const storeRewrap = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => true }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { email: 'ada@example.com' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getUser: async () => ({ data: { user: { email: 'ada@example.com' } } }),
      updateUser: (...a: unknown[]) => updateUser(...a),
    },
  }),
}))
vi.mock('@/lib/context/encryption-context', () => ({ useEncryption: () => ({ unlock }) }))
vi.mock('@/lib/hooks/use-turnstile', () => ({
  useTurnstile: () => ({ attach: () => undefined, getToken: async () => 'captcha' }),
}))
vi.mock('@/lib/actions/recovery.actions', () => ({
  getPasskeyUnlockMaterialAction: (...a: unknown[]) => getPasskeyUnlockMaterialAction(...a),
  getRecoveryMaterialAction: (...a: unknown[]) => getRecoveryMaterialAction(...a),
  retirePasskeyUnlocksAction: (...a: unknown[]) => retirePasskeyUnlocksAction(...a),
}))
vi.mock('@/lib/account/passkey-unlock', () => ({ unlockWithPasskey: (...a: unknown[]) => unlockWithPasskey(...a) }))
vi.mock('@/lib/account/step-up', () => ({ stepUpWithPassword: (...a: unknown[]) => stepUpWithPassword(...a) }))
vi.mock('@/lib/account/account-crypto', () => ({
  deriveMasterKey: async () => NEW_KEY,
  EntriesUnderAnotherKeyError: class extends Error {},
  openVaultWithRecoverySecret: vi.fn(),
  prepareRewrap: (...a: unknown[]) => prepareRewrap(...a),
  setupRecoveryFromPassword: async () => 'NEWC-ODE0-0000-0000-00000',
  storeRewrap: (...a: unknown[]) => storeRewrap(...a),
  vaultHasContent: (material: { probe: unknown; ingest_key: unknown }) =>
    material.probe !== null || material.ingest_key !== null,
  vaultOpensWith: async () => false,
}))
vi.mock('@/components/settings/recovery-code-display', () => ({
  RecoveryCodeDisplay: ({ code }: { code: string }) => <p>{code}</p>,
}))

const NEW_KEY = { type: 'secret', usages: ['encrypt'] } as unknown as CryptoKey
const OLD_KEY = { type: 'secret', usages: ['decrypt'] } as unknown as CryptoKey
const PASSWORD = 'NewPassword789!'
const probe = { encrypted_dek: 'ZGVr', dek_salt: 'aXY=' }
const passkeys = {
  passkeys: [{ credentialId: 'cred-1', wrappedMasterKey: 'd3JhcHBlZA==', salt: 'c2FsdA==' }],
  probe,
  ingest_key: null,
}
const recovery = (overrides: Record<string, unknown> = {}) => ({
  key_salt: 'a2V5LXNhbHQ=',
  escrow: { wrapped_master_key: 'ZXNjcm93', salt: 'c2FsdA==' },
  factors: [],
  probe,
  ingest_key: null,
  ...overrides,
})

const { default: RecoverVaultPage } = await import('@/app/(auth)/recover-vault/page')

/** The form appears once the page has found the session. */
async function typePasswords() {
  await userEvent.type(await screen.findByLabelText('New password'), PASSWORD)
  await userEvent.type(screen.getByLabelText('Confirm new password'), PASSWORD)
}

beforeEach(() => {
  // A reset, not a clear: a once-value one test left queued must not reach the next.
  for (const mock of [
    updateUser,
    unlock,
    stepUpWithPassword,
    unlockWithPasskey,
    getPasskeyUnlockMaterialAction,
    getRecoveryMaterialAction,
    retirePasskeyUnlocksAction,
    prepareRewrap,
    storeRewrap,
  ]) {
    mock.mockReset()
  }
  updateUser.mockResolvedValue({ error: null })
  stepUpWithPassword.mockResolvedValue('grant')
  getPasskeyUnlockMaterialAction.mockResolvedValue(passkeys)
  getRecoveryMaterialAction.mockResolvedValue(recovery())
  retirePasskeyUnlocksAction.mockResolvedValue({ retired: 1 })
  unlockWithPasskey.mockResolvedValue(OLD_KEY)
  prepareRewrap.mockResolvedValue({ entries: [{ id: 'e1' }], ingestKey: null })
  storeRewrap.mockResolvedValue({ count: 1, retiredKits: 0, retiredPasskeys: 1 })
})

describe('the reset page with a passkey that opens the vault', () => {
  it('asks before resetting without restoring, then stops the passkeys opening the vault', async () => {
    render(<RecoverVaultPage />)
    await screen.findByRole('button', { name: 'Restore with a passkey' })
    await typePasswords()

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent('your passkeys stop opening your vault')
    expect(warning).toHaveTextContent('until you use your recovery code or kit')
    expect(updateUser).not.toHaveBeenCalled()
    expect(retirePasskeyUnlocksAction).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Reset without restoring' }))

    expect(await screen.findByText(/Your passkeys no longer open your vault\./)).toBeInTheDocument()
    expect(updateUser).toHaveBeenCalledWith({ password: PASSWORD })
    expect(stepUpWithPassword).toHaveBeenCalledWith('remove_recovery_factor', 'ada@example.com', PASSWORD, 'captcha')
    expect(retirePasskeyUnlocksAction).toHaveBeenCalledWith({ stepUpToken: 'grant' })
    // The copies go only once the new password is set and proved.
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(retirePasskeyUnlocksAction.mock.invocationCallOrder[0])
    expect(storeRewrap).not.toHaveBeenCalled()
  })

  it('says the data cannot be decrypted when there is no code or kit to fall back on', async () => {
    getRecoveryMaterialAction.mockResolvedValue(recovery({ escrow: null, factors: [] }))
    render(<RecoverVaultPage />)
    await screen.findByRole('button', { name: 'Restore with a passkey' })
    await typePasswords()

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'your data cannot be decrypted, because you have no recovery code or kit'
    )
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('changes nothing when the passkeys cannot be read', async () => {
    getPasskeyUnlockMaterialAction.mockRejectedValue(new Error('read failed'))
    render(<RecoverVaultPage />)
    await typePasswords()
    expect(screen.queryByRole('button', { name: 'Restore with a passkey' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your passkeys could not be checked')
    expect(updateUser).not.toHaveBeenCalled()
    expect(retirePasskeyUnlocksAction).not.toHaveBeenCalled()
  })

  it('finds the passkeys at submit when the first read failed, and offers them', async () => {
    getPasskeyUnlockMaterialAction.mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(passkeys)
    render(<RecoverVaultPage />)
    await typePasswords()

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('your passkeys stop opening your vault')
    expect(screen.getByRole('button', { name: 'Restore with a passkey' })).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('says so when the passkeys could not be stopped after the reset', async () => {
    retirePasskeyUnlocksAction.mockRejectedValue(new Error('retire failed'))
    render(<RecoverVaultPage />)
    await screen.findByRole('button', { name: 'Restore with a passkey' })
    await typePasswords()

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reset without restoring' }))

    expect(await screen.findByText(/Your passkeys could not be updated/)).toBeInTheDocument()
  })

  it('restores the vault with the passkey, and leaves retiring the copies to the re-wrap', async () => {
    render(<RecoverVaultPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Restore with a passkey' }))

    expect(await screen.findByText(/Your passkey opened your vault/)).toBeInTheDocument()
    // The prompt opened from the material read beforehand.
    expect(unlockWithPasskey).toHaveBeenCalledWith(passkeys)
    expect(screen.queryByLabelText('Recovery code or kit')).not.toBeInTheDocument()

    await typePasswords()
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByText(/1 vault entry was restored/)).toBeInTheDocument()
    expect(screen.getByText(/turn this back on for each one in Settings/)).toBeInTheDocument()
    expect(prepareRewrap).toHaveBeenCalledWith(OLD_KEY, NEW_KEY)
    expect(stepUpWithPassword).toHaveBeenCalledWith('change_password', 'ada@example.com', PASSWORD, 'captcha')
    expect(storeRewrap).toHaveBeenCalledWith(expect.anything(), 'recovery', 'grant')
    expect(retirePasskeyUnlocksAction).not.toHaveBeenCalled()
    expect(unlock).toHaveBeenCalledWith(PASSWORD, 'a2V5LXNhbHQ=')
  })

  it('resets without asking when no passkey opens the vault', async () => {
    getPasskeyUnlockMaterialAction.mockResolvedValue({ passkeys: [], probe, ingest_key: null })
    render(<RecoverVaultPage />)
    await typePasswords()

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: PASSWORD }))
    expect(await screen.findByText(/Enter your recovery code or kit to also restore/)).toBeInTheDocument()
    expect(retirePasskeyUnlocksAction).not.toHaveBeenCalled()
  })
})
