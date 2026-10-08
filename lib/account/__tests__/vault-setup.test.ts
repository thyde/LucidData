import { describe, it, expect, beforeEach, vi } from 'vitest'

const claimKeySaltAction = vi.fn()
const setRecoveryEscrowAction = vi.fn()
const addRecoveryFactorAction = vi.fn()

vi.mock('@/lib/actions/account.actions', () => ({
  claimKeySaltAction: (...args: unknown[]) => claimKeySaltAction(...args),
  setRecoveryEscrowAction: (...args: unknown[]) => setRecoveryEscrowAction(...args),
  rewrapVaultEntriesAction: vi.fn(),
}))
vi.mock('@/lib/actions/recovery.actions', () => ({
  addRecoveryFactorAction: (...args: unknown[]) => addRecoveryFactorAction(...args),
}))
vi.mock('@/lib/actions/vault.actions', () => ({ getVaultEntriesAction: vi.fn() }))

const { setUpVault } = await import('@/lib/account/account-crypto')

const STORED_ELSEWHERE = `${'A'.repeat(43)}=`

beforeEach(() => {
  vi.clearAllMocks()
  claimKeySaltAction.mockImplementation(async ({ keySalt }: { keySalt: string }) => keySalt)
  setRecoveryEscrowAction.mockResolvedValue(undefined)
  addRecoveryFactorAction.mockResolvedValue(undefined)
})

describe('setUpVault', () => {
  it('claims a fresh 32-byte salt and returns a recovery code for it', async () => {
    const setup = await setUpVault('correct horse battery staple')
    const sent = claimKeySaltAction.mock.calls[0][0].keySalt as string
    expect(sent).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(setup.keySalt).toBe(sent)
    expect(setup.recoveryCode).toMatch(/\S{10,}/)
    // Only wrapped key material reaches the server, never the code itself.
    const escrow = JSON.stringify(setRecoveryEscrowAction.mock.calls[0][0])
    expect(escrow).not.toContain(setup.recoveryCode as string)
  }, 30_000)

  it('uses the stored salt and skips recovery when another tab set up first', async () => {
    claimKeySaltAction.mockResolvedValue(STORED_ELSEWHERE)
    const setup = await setUpVault('correct horse battery staple')
    expect(setup).toEqual({ keySalt: STORED_ELSEWHERE, recoveryCode: null })
    expect(setRecoveryEscrowAction).not.toHaveBeenCalled()
  })

  it('still returns the salt when the recovery code could not be stored', async () => {
    setRecoveryEscrowAction.mockRejectedValue(new Error('network'))
    const setup = await setUpVault('correct horse battery staple')
    expect(setup.keySalt).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(setup.recoveryCode).toBeNull()
  }, 30_000)

  it('stops when the salt cannot be claimed, so no key comes from an unstored salt', async () => {
    claimKeySaltAction.mockResolvedValue({ __lucidActionFailure: true, message: 'Unauthorized' })
    await expect(setUpVault('correct horse battery staple')).rejects.toThrow('Unauthorized')
    expect(setRecoveryEscrowAction).not.toHaveBeenCalled()
  })
})
