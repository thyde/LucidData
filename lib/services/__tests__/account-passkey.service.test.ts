import { beforeEach, describe, expect, it, vi } from 'vitest'

const maybeSingle = vi.fn()
const select = vi.fn(() => ({ maybeSingle }))
const eqUser = vi.fn(() => ({ select }))
const eqId = vi.fn(() => ({ eq: eqUser }))
const deleteRows = vi.fn(() => ({ eq: eqId }))
const from = vi.fn(() => ({ delete: deleteRows }))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from })),
}))
vi.mock('@/lib/services/audit.service', () => ({ createAuditEntry: vi.fn() }))
vi.mock('@/lib/repositories/user.repository', () => ({}))
vi.mock('@/lib/repositories/vault.repository', () => ({}))
vi.mock('@/lib/services/security-notification.service', () => ({ notifySecurityEvent: vi.fn() }))

import { createAuditEntry } from '@/lib/services/audit.service'
import { removePasskey } from '@/lib/services/account.service'

describe('removePasskey', () => {
  beforeEach(() => vi.clearAllMocks())

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
      metadata: { passkey_id: 'passkey-1' },
    })
  })

  it('does not audit a passkey outside the user scope', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(removePasskey('user-1', 'missing')).rejects.toThrow('Passkey not found')
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})