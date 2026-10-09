import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/repositories/audit.repository', () => ({
  appendAuditLog: vi.fn(),
  findOwnChainHead: vi.fn(),
  findAuditChain: vi.fn(),
}))

import * as auditRepo from '@/lib/repositories/audit.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { AuditLog } from '@/types/database.types'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auditRepo.appendAuditLog).mockImplementation(async (entry) => entry as unknown as AuditLog)
})

describe('createAuditEntry', () => {
  it('leaves the link, the hash, and the time to the database, which takes them under the head lock', async () => {
    await createAuditEntry({
      userId: 'user-1',
      eventType: 'data_created',
      action: 'Created an entry',
      vaultDataId: 'entry-1',
      metadata: { vault_data_ids: ['entry-1'] },
    })

    const entry = vi.mocked(auditRepo.appendAuditLog).mock.calls[0][0]
    expect(entry).toEqual({
      user_id: 'user-1',
      vault_data_id: 'entry-1',
      consent_id: undefined,
      event_type: 'data_created',
      action: 'Created an entry',
      actor_id: 'user-1',
      actor_type: 'user',
      actor_name: undefined,
      ip_address: undefined,
      user_agent: undefined,
      method: undefined,
      success: true,
      error_message: undefined,
      metadata: { vault_data_ids: ['entry-1'] },
    })
    expect(entry).not.toHaveProperty('previous_hash')
    expect(entry).not.toHaveProperty('current_hash')
    expect(entry).not.toHaveProperty('timestamp')
  })

  it('keeps an actor the caller names, such as the system', async () => {
    await createAuditEntry({ userId: 'user-1', eventType: 'consent_expired', action: 'Expired', actorType: 'system', actorId: 'scheduler' })
    expect(vi.mocked(auditRepo.appendAuditLog).mock.calls[0][0]).toMatchObject({ actor_type: 'system', actor_id: 'scheduler' })
  })

  it('passes a failure straight through', async () => {
    const broken = { code: '23503', message: 'insert or update violates foreign key constraint' }
    vi.mocked(auditRepo.appendAuditLog).mockRejectedValue(broken)
    await expect(createAuditEntry({ userId: 'user-1', eventType: 'e', action: 'a' })).rejects.toBe(broken)
  })
})
