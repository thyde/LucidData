import { beforeEach, describe, expect, it, vi } from 'vitest'

const consumeStepUp = vi.fn()
const createAuditEntry = vi.fn()
const notifySecurityEvent = vi.fn()
const retireRecoveryFactors = vi.fn()
const getUserVaultData = vi.fn()
const logError = vi.fn()
const rewraps = {
  startRewrap: vi.fn(),
  findActiveRewrap: vi.fn(),
  stageRewrapEntries: vi.fn(),
  countStagedEntries: vi.fn(),
  countVaultEntries: vi.fn(),
  dropRewrap: vi.fn(),
  applyRewrap: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/repositories/vault-rewrap.repository', () => ({
  startRewrap: (...a: unknown[]) => rewraps.startRewrap(...a),
  findActiveRewrap: (...a: unknown[]) => rewraps.findActiveRewrap(...a),
  stageRewrapEntries: (...a: unknown[]) => rewraps.stageRewrapEntries(...a),
  countStagedEntries: (...a: unknown[]) => rewraps.countStagedEntries(...a),
  countVaultEntries: (...a: unknown[]) => rewraps.countVaultEntries(...a),
  dropRewrap: (...a: unknown[]) => rewraps.dropRewrap(...a),
  applyRewrap: (...a: unknown[]) => rewraps.applyRewrap(...a),
}))
vi.mock('@/lib/repositories/vault.repository', () => ({ findVaultKeyEnvelopes: vi.fn() }))
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

const { applyVaultRewrap, beginVaultRewrap, getEntriesForExport, rewrapVaultEntries, stageVaultRewrap } =
  await import('@/lib/services/account.service')
const { REWRAP_PART_SIZE } = await import('@luciddata/core/validations/account')

const REWRAP = '5b0e7a5e-3d4f-4b8a-9c21-6f1e2d3c4b5a'

const envelope = (n: number) => ({
  id: `7f1c6a52-5f0e-4b6e-9a43-${String(n).padStart(12, '0')}`,
  encrypted_dek: 'bmV3LWRlaw==',
  dek_salt: 'bmV3LWl2',
  previous_encrypted_dek: 'b2xkLWRlaw==',
})

const ENTRIES = [envelope(1)]

beforeEach(() => {
  vi.clearAllMocks()
  consumeStepUp.mockResolvedValue(undefined)
  createAuditEntry.mockResolvedValue(undefined)
  notifySecurityEvent.mockResolvedValue(undefined)
  retireRecoveryFactors.mockResolvedValue({ kits: 0, passkeys: 0 })
  rewraps.startRewrap.mockResolvedValue(REWRAP)
  rewraps.findActiveRewrap.mockResolvedValue({ id: REWRAP, reason: 'password_change' })
  rewraps.stageRewrapEntries.mockResolvedValue(undefined)
  rewraps.countStagedEntries.mockResolvedValue(1)
  rewraps.countVaultEntries.mockResolvedValue(1)
  rewraps.dropRewrap.mockResolvedValue(undefined)
  rewraps.applyRewrap.mockResolvedValue(1)
})

describe('beginVaultRewrap', () => {
  it('needs a grant for change_password before it starts anything', async () => {
    consumeStepUp.mockRejectedValue(new Error('Confirm your password again to continue'))

    await expect(beginVaultRewrap('user-1', 'password_change', 'used-grant')).rejects.toThrow(/Confirm your password/)
    expect(consumeStepUp).toHaveBeenCalledWith('user-1', 'change_password', 'used-grant')
    expect(rewraps.startRewrap).not.toHaveBeenCalled()
  })

  it('starts a re-wrap for the person, with its reason', async () => {
    expect(await beginVaultRewrap('user-1', 'recovery', 'grant')).toEqual({ rewrapId: REWRAP })
    expect(rewraps.startRewrap).toHaveBeenCalledWith('user-1', 'recovery')
  })
})

describe('stageVaultRewrap', () => {
  it('refuses a re-wrap that has expired or is not the person\'s', async () => {
    rewraps.findActiveRewrap.mockResolvedValue(null)

    await expect(stageVaultRewrap('user-1', REWRAP, ENTRIES)).rejects.toMatchObject({ code: 'not_found' })
    expect(rewraps.findActiveRewrap).toHaveBeenCalledWith('user-1', REWRAP)
    expect(rewraps.stageRewrapEntries).not.toHaveBeenCalled()
  })

  it('adds the part and says how many envelopes are waiting', async () => {
    expect(await stageVaultRewrap('user-1', REWRAP, ENTRIES)).toEqual({ staged: 1 })
    expect(rewraps.stageRewrapEntries).toHaveBeenCalledWith(REWRAP, ENTRIES)
    expect(rewraps.countVaultEntries).toHaveBeenCalledWith('user-1')
  })

  it('drops a re-wrap that holds more envelopes than the vault holds entries', async () => {
    rewraps.countStagedEntries.mockResolvedValue(3)
    rewraps.countVaultEntries.mockResolvedValue(2)

    await expect(stageVaultRewrap('user-1', REWRAP, ENTRIES)).rejects.toMatchObject({ code: 'conflict' })
    expect(rewraps.dropRewrap).toHaveBeenCalledWith('user-1', REWRAP)
  })
})

describe('applyVaultRewrap', () => {
  it('stores every staged envelope at once, then audits and retires the factors', async () => {
    rewraps.findActiveRewrap.mockResolvedValue({ id: REWRAP, reason: 'recovery' })
    rewraps.applyRewrap.mockResolvedValue(3)
    retireRecoveryFactors.mockResolvedValue({ kits: 2, passkeys: 1 })

    expect(await applyVaultRewrap('user-1', REWRAP)).toEqual({ rewrapped: 3, retiredKits: 2, retiredPasskeys: 1 })

    expect(rewraps.applyRewrap).toHaveBeenCalledWith('user-1', REWRAP, undefined)
    expect(rewraps.applyRewrap.mock.invocationCallOrder[0]).toBeLessThan(
      retireRecoveryFactors.mock.invocationCallOrder[0]
    )
    // The reason comes from when the re-wrap started, not from the caller now.
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'vault_recovered', action: 'Recovered vault and re-encrypted 3 vault entries' })
    )
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'vault_recovered')
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'recovery_kits_retired')
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'passkey_unlocks_retired')
  })

  it('moves the connector key in the same transaction as the entries', async () => {
    const ingestKey = { previous: 'b2xkLXdyYXA=', wrapped: 'bmV3LXdyYXA=' }

    await applyVaultRewrap('user-1', REWRAP, ingestKey)

    expect(rewraps.applyRewrap).toHaveBeenCalledTimes(1)
    expect(rewraps.applyRewrap).toHaveBeenCalledWith('user-1', REWRAP, ingestKey)
  })

  it('refuses a re-wrap that has expired or is not the person\'s, before applying anything', async () => {
    rewraps.findActiveRewrap.mockResolvedValue(null)

    await expect(applyVaultRewrap('user-1', REWRAP)).rejects.toMatchObject({ code: 'not_found' })
    expect(rewraps.applyRewrap).not.toHaveBeenCalled()
  })

  it('reports a vault changed meanwhile as a conflict, and keeps every factor', async () => {
    rewraps.applyRewrap.mockRejectedValue({ code: 'PT409', message: 'A vault entry changed after it was read' })

    await expect(applyVaultRewrap('user-1', REWRAP)).rejects.toMatchObject({ code: 'conflict' })
    expect(retireRecoveryFactors).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('reports a re-wrap that expired during the apply as not found', async () => {
    rewraps.applyRewrap.mockRejectedValue({ code: 'PT410', message: 'The re-wrap has expired or does not exist' })

    await expect(applyVaultRewrap('user-1', REWRAP)).rejects.toMatchObject({ code: 'not_found' })
    expect(retireRecoveryFactors).not.toHaveBeenCalled()
  })

  it('keeps every factor when the apply fails for another reason', async () => {
    rewraps.applyRewrap.mockRejectedValue({ code: '57014', message: 'canceling statement due to statement timeout' })

    await expect(applyVaultRewrap('user-1', REWRAP)).rejects.toMatchObject({ code: '57014' })
    expect(retireRecoveryFactors).not.toHaveBeenCalled()
  })

  it('says nothing about kits or passkeys when none were retired', async () => {
    await applyVaultRewrap('user-1', REWRAP)

    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'password_changed')
    expect(notifySecurityEvent).not.toHaveBeenCalledWith('user-1', 'recovery_kits_retired')
    expect(notifySecurityEvent).not.toHaveBeenCalledWith('user-1', 'passkey_unlocks_retired')
  })

  it('never reports a failure once the new wrapping is stored', async () => {
    // The browser rolls the password back on failure, which after a stored
    // re-wrap would leave every entry under a key no password derives.
    createAuditEntry.mockRejectedValue(new Error('audit insert failed'))
    retireRecoveryFactors.mockRejectedValue(new Error('retire failed'))

    await expect(applyVaultRewrap('user-1', REWRAP)).resolves.toEqual({ rewrapped: 1, retiredKits: 0, retiredPasskeys: 0 })
    expect(logError).toHaveBeenCalledTimes(2)
  })
})

describe('rewrapVaultEntries, the whole re-wrap in one call', () => {
  it('needs a grant for change_password before it stages anything', async () => {
    consumeStepUp.mockRejectedValue(new Error('Confirm your password again to continue'))

    await expect(rewrapVaultEntries('user-1', 'password_change', ENTRIES, 'used-grant')).rejects.toThrow(
      /Confirm your password/
    )
    expect(rewraps.stageRewrapEntries).not.toHaveBeenCalled()
    expect(rewraps.applyRewrap).not.toHaveBeenCalled()
  })

  it('stages a large vault in parts and applies it once', async () => {
    const entries = Array.from({ length: REWRAP_PART_SIZE + 1 }, (_, n) => envelope(n))
    rewraps.applyRewrap.mockResolvedValue(entries.length)

    expect(await rewrapVaultEntries('user-1', 'password_change', entries, 'grant')).toEqual({
      retiredKits: 0,
      retiredPasskeys: 0,
    })

    expect(rewraps.stageRewrapEntries.mock.calls.map(([, part]) => (part as unknown[]).length)).toEqual([
      REWRAP_PART_SIZE,
      1,
    ])
    expect(rewraps.applyRewrap).toHaveBeenCalledTimes(1)
  })

  it('refuses an entry sent twice before it uses the grant', async () => {
    await expect(
      rewrapVaultEntries('user-1', 'password_change', [envelope(1), envelope(1)], 'grant')
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(consumeStepUp).not.toHaveBeenCalled()
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
