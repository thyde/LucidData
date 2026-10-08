import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const consumeStepUp = vi.fn()
const createAuditEntry = vi.fn()
const notifySecurityEvent = vi.fn()
const retireRecoveryFactors = vi.fn()
const getUserVaultData = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc }) }))
vi.mock('@/lib/services/session-security.service', () => ({
  consumeStepUp: (...a: unknown[]) => consumeStepUp(...a),
}))
vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))
vi.mock('@/lib/services/security-notification.service', () => ({
  notifySecurityEvent: (...a: unknown[]) => notifySecurityEvent(...a),
}))
vi.mock('@/lib/services/recovery-factor.service', () => ({
  retireRecoveryFactors: (...a: unknown[]) => retireRecoveryFactors(...a),
  storeRecoveryCode: vi.fn(),
}))
vi.mock('@/lib/services/vault.service', () => ({
  getUserVaultData: (...a: unknown[]) => getUserVaultData(...a),
}))
vi.mock('@/lib/services/error-logger', () => ({
  errorLogger: { log: (...a: unknown[]) => logError(...a) },
  ErrorSeverity: { HIGH: 'high' },
}))
vi.mock('@/lib/repositories/user.repository', () => ({}))
vi.mock('@/lib/services/payout.service', () => ({ flushOwedBalance: vi.fn() }))
vi.mock('@/lib/services/deletion.service', () => ({ eraseUser: vi.fn() }))

const { rewrapVaultEntries, getEntriesForExport } = await import('@/lib/services/account.service')

const ENTRIES = [
  {
    id: '7f1c6a52-5f0e-4b6e-9a43-0d3f4c1e2a11',
    encrypted_dek: 'bmV3LWRlaw==',
    dek_salt: 'bmV3LWl2',
    previous_encrypted_dek: 'b2xkLWRlaw==',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ error: null })
  consumeStepUp.mockResolvedValue(undefined)
  createAuditEntry.mockResolvedValue(undefined)
  notifySecurityEvent.mockResolvedValue(undefined)
  retireRecoveryFactors.mockResolvedValue({ kits: 0 })
})

describe('rewrapVaultEntries', () => {
  it('needs a grant for change_password before it touches any entry', async () => {
    consumeStepUp.mockRejectedValue(new Error('Confirm your password again to continue'))

    await expect(rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'used-grant')).rejects.toThrow(
      /Confirm your password/
    )
    expect(consumeStepUp).toHaveBeenCalledWith('user-1', 'change_password', 'used-grant')
    expect(rpc).not.toHaveBeenCalled()
    expect(retireRecoveryFactors).not.toHaveBeenCalled()
  })

  it('stores every envelope for the caller in one call, then retires the factors', async () => {
    retireRecoveryFactors.mockResolvedValue({ kits: 2 })

    expect(await rewrapVaultEntries('user-1', 'recovery', ENTRIES, 'grant')).toEqual({ retiredKits: 2 })

    expect(rpc).toHaveBeenCalledWith('rewrap_vault_keys', { p_user_id: 'user-1', p_entries: ENTRIES })
    expect(retireRecoveryFactors).toHaveBeenCalledWith('user-1')
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      retireRecoveryFactors.mock.invocationCallOrder[0]
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'vault_recovered' })
    )
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'vault_recovered')
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'recovery_kits_retired')
  })

  it('moves the connector key in the same transaction as the entries', async () => {
    const ingestKey = { previous: 'b2xkLXdyYXA=', wrapped: 'bmV3LXdyYXA=' }

    await rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'grant', ingestKey)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('rewrap_vault_keys', {
      p_user_id: 'user-1',
      p_entries: ENTRIES,
      p_ingest_key: ingestKey,
    })
  })

  it('reports an entry edited meanwhile as a conflict, and keeps every factor', async () => {
    rpc.mockResolvedValue({ error: { code: 'PT409', message: 'A vault entry changed after it was read' } })

    await expect(rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'grant')).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(retireRecoveryFactors).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('keeps every factor when the re-wrap is refused for another reason', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0001', message: 'Every vault entry must be supplied exactly once' } })

    await expect(rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'grant')).rejects.toMatchObject({
      message: 'Every vault entry must be supplied exactly once',
    })
    expect(retireRecoveryFactors).not.toHaveBeenCalled()
  })

  it('says nothing about kits when none were retired', async () => {
    await rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'grant')

    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'password_changed')
    expect(notifySecurityEvent).not.toHaveBeenCalledWith('user-1', 'recovery_kits_retired')
  })

  it('never reports a failure once the new wrapping is stored', async () => {
    // The browser rolls the password back on failure, which after a stored
    // re-wrap would leave every entry under a key no password derives.
    createAuditEntry.mockRejectedValue(new Error('audit insert failed'))
    retireRecoveryFactors.mockRejectedValue(new Error('retire failed'))

    await expect(rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'grant')).resolves.toEqual({
      retiredKits: 0,
    })
    expect(logError).toHaveBeenCalledTimes(2)
  })
})

describe('getEntriesForExport', () => {
  it('needs a grant for export_vault', async () => {
    consumeStepUp.mockRejectedValue(new Error('Confirm your password again to continue'))

    await expect(getEntriesForExport('user-1', 'used-grant')).rejects.toThrow()
    expect(consumeStepUp).toHaveBeenCalledWith('user-1', 'export_vault', 'used-grant')
    expect(getUserVaultData).not.toHaveBeenCalled()
  })

  it('returns the person\'s entries once they confirm', async () => {
    getUserVaultData.mockResolvedValue([{ id: 'entry-1' }])

    expect(await getEntriesForExport('user-1', 'grant')).toEqual([{ id: 'entry-1' }])
    expect(getUserVaultData).toHaveBeenCalledWith('user-1')
  })
})
