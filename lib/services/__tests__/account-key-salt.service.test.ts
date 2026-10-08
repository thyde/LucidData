import { describe, it, expect, beforeEach, vi } from 'vitest'

const setKeySaltIfUnset = vi.fn()
const createAuditEntry = vi.fn()

vi.mock('@/lib/repositories/user.repository', () => ({
  setKeySaltIfUnset: (...args: unknown[]) => setKeySaltIfUnset(...args),
}))
vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...args: unknown[]) => createAuditEntry(...args),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/services/security-notification.service', () => ({ notifySecurityEvent: vi.fn() }))
vi.mock('@/lib/services/payout.service', () => ({ flushOwedBalance: vi.fn() }))
vi.mock('@/lib/services/deletion.service', () => ({ eraseUser: vi.fn() }))

const { claimKeySalt } = await import('@/lib/services/account.service')

beforeEach(() => {
  vi.clearAllMocks()
  createAuditEntry.mockResolvedValue({})
})

describe('claimKeySalt', () => {
  it('stores the proposed salt on a new account and records it', async () => {
    setKeySaltIfUnset.mockResolvedValue('proposed')
    expect(await claimKeySalt('user-1', 'proposed')).toBe('proposed')
    expect(setKeySaltIfUnset).toHaveBeenCalledWith('user-1', 'proposed')
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'vault_initialized' })
    )
  })

  it('returns the salt already stored, so the caller derives the right key', async () => {
    setKeySaltIfUnset.mockResolvedValue('stored-earlier')
    expect(await claimKeySalt('user-1', 'proposed')).toBe('stored-earlier')
    // Nothing changed, so there is nothing to record.
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('fails loudly rather than letting the browser use an unstored salt', async () => {
    setKeySaltIfUnset.mockResolvedValue(null)
    await expect(claimKeySalt('user-1', 'proposed')).rejects.toThrow('Key salt was not stored')
  })
})
