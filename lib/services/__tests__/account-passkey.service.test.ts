import { beforeEach, describe, expect, it, vi } from 'vitest'

const maybeSingle = vi.fn()
const select = vi.fn(() => ({ maybeSingle }))
const eqUser = vi.fn(() => ({ select }))
const eqId = vi.fn(() => ({ eq: eqUser }))
const deleteRows = vi.fn(() => ({ eq: eqId }))

// LD-112: how many vault copies the passkey has, read before it goes.
const unlockCount = vi.fn()
const countFilters: Record<string, unknown>[] = []
function countChain(filters: Record<string, unknown> = {}) {
  return {
    eq(column: string, value: unknown) {
      return countChain({ ...filters, [column]: value })
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      countFilters.push(filters)
      return Promise.resolve(unlockCount()).then(resolve, reject)
    },
  }
}

const from = vi.fn((table: string) =>
  table === 'recovery_factors' ? { select: () => countChain() } : { delete: deleteRows }
)

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from })),
}))
vi.mock('@/lib/services/audit.service', () => ({ createAuditEntry: vi.fn() }))
vi.mock('@/lib/repositories/user.repository', () => ({}))
vi.mock('@/lib/repositories/vault.repository', () => ({}))
vi.mock('@/lib/services/security-notification.service', () => ({ notifySecurityEvent: vi.fn() }))

import { createAuditEntry } from '@/lib/services/audit.service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'
import { removePasskey } from '@/lib/services/account.service'

describe('removePasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    countFilters.length = 0
    unlockCount.mockReturnValue({ count: 0, error: null })
  })

  it('scopes deletion to the authenticated owner and audits it', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'passkey-1' }, error: null })

    await removePasskey('user-1', 'passkey-1')

    expect(from).toHaveBeenCalledWith('passkeys')
    expect(eqId).toHaveBeenCalledWith('id', 'passkey-1')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(createAuditEntry).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'passkey_removed',
      action: 'Removed a registered passkey',
      metadata: { passkey_id: 'passkey-1', opened_vault: false },
    })
    expect(notifySecurityEvent).not.toHaveBeenCalled()
  })

  it('says when the passkey could open the vault, whose copy goes with it', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'passkey-1' }, error: null })
    unlockCount.mockReturnValue({ count: 1, error: null })

    await removePasskey('user-1', 'passkey-1')

    expect(countFilters).toEqual([{ user_id: 'user-1', passkey_id: 'passkey-1' }])
    expect(createAuditEntry).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'passkey_removed',
      action: 'Removed a registered passkey, which also stopped it opening the vault',
      metadata: { passkey_id: 'passkey-1', opened_vault: true },
    })
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'passkey_unlock_removed')
  })

  it('does not audit a passkey outside the user scope', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(removePasskey('user-1', 'missing')).rejects.toThrow('Passkey not found')
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})
