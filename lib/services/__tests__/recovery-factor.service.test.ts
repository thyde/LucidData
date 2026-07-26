import { describe, it, expect, beforeEach, vi } from 'vitest'

const findUserById = vi.fn()
const updateUser = vi.fn()
const createAuditEntry = vi.fn()
const notifySecurityEvent = vi.fn()

const factorRows = vi.fn()
const vaultCount = vi.fn()
const inserted = vi.fn()

vi.mock('@/lib/repositories/user.repository', () => ({
  findUserById: (...a: unknown[]) => findUserById(...a),
  updateUser: (...a: unknown[]) => updateUser(...a),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/services/security-notification.service', () => ({
  notifySecurityEvent: (...a: unknown[]) => notifySecurityEvent(...a),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      let op = 'select'
      const chain = {
        select: (_cols?: string, options?: { head?: boolean }) => {
          if (options?.head) op = 'count'
          return chain
        },
        insert: (payload: unknown) => {
          op = 'insert'
          inserted(payload)
          return chain
        },
        update: () => {
          op = 'update'
          return chain
        },
        delete: () => {
          op = 'delete'
          return chain
        },
        eq: () => chain,
        order: () => Promise.resolve(factorRows()),
        maybeSingle: () => Promise.resolve({ data: { id: 'factor-1', type: 'recovery_kit' }, error: null }),
        single: () =>
          Promise.resolve({
            data: {
              id: 'factor-new',
              type: 'recovery_kit',
              label: 'Backup kit',
              created_at: '2026-07-25T00:00:00.000Z',
              last_confirmed_at: '2026-07-25T00:00:00.000Z',
            },
            error: null,
          }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            op === 'count' && table === 'vault_data'
              ? { count: vaultCount(), error: null }
              : { error: null }
          ),
      }
      return chain
    },
  }),
}))

const {
  getRecoveryStatus,
  assertRecoveryReadyForFirstWrite,
  addRecoveryFactor,
  confirmRecoveryFactor,
  declineRecoverySetup,
  CONFIRMATION_INTERVAL_DAYS,
} = await import('@/lib/services/recovery-factor.service')

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    recovery_setup_declined_at: null,
    recovery_last_confirmed_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  findUserById.mockReset().mockResolvedValue(user())
  updateUser.mockReset().mockResolvedValue(undefined)
  createAuditEntry.mockReset().mockResolvedValue(undefined)
  notifySecurityEvent.mockReset().mockResolvedValue(undefined)
  factorRows.mockReset().mockReturnValue({ data: [], error: null })
  vaultCount.mockReset().mockReturnValue(0)
  inserted.mockReset()
})

describe('assertRecoveryReadyForFirstWrite', () => {
  it('blocks a new user with no factor and no decline', async () => {
    await expect(assertRecoveryReadyForFirstWrite('user-1')).rejects.toThrow(
      /Set up a recovery factor/i
    )
  })

  it('allows a user who has a factor', async () => {
    factorRows.mockReturnValue({
      data: [
        {
          id: 'f1',
          type: 'recovery_code',
          label: 'Recovery code',
          created_at: '2026-07-25T00:00:00.000Z',
          last_confirmed_at: '2026-07-25T00:00:00.000Z',
        },
      ],
      error: null,
    })

    await expect(assertRecoveryReadyForFirstWrite('user-1')).resolves.toBeUndefined()
  })

  it('allows a user who explicitly declined', async () => {
    findUserById.mockResolvedValue(
      user({ recovery_setup_declined_at: '2026-07-25T00:00:00.000Z' })
    )
    await expect(assertRecoveryReadyForFirstWrite('user-1')).resolves.toBeUndefined()
  })

  it('never blocks a user who already holds vault data', async () => {
    vaultCount.mockReturnValue(12)
    await expect(assertRecoveryReadyForFirstWrite('user-1')).resolves.toBeUndefined()
  })
})

describe('getRecoveryStatus', () => {
  it('asks for confirmation once the interval has passed', async () => {
    const stale = new Date(
      Date.now() - (CONFIRMATION_INTERVAL_DAYS + 1) * 24 * 60 * 60 * 1000
    ).toISOString()
    findUserById.mockResolvedValue(user({ recovery_last_confirmed_at: stale }))
    factorRows.mockReturnValue({
      data: [
        {
          id: 'f1',
          type: 'recovery_code',
          label: 'Recovery code',
          created_at: stale,
          last_confirmed_at: stale,
        },
      ],
      error: null,
    })

    const status = await getRecoveryStatus('user-1')
    expect(status.confirmationDue).toBe(true)
  })

  it('does not ask for confirmation when there is nothing to confirm', async () => {
    const status = await getRecoveryStatus('user-1')
    expect(status.factors).toEqual([])
    expect(status.confirmationDue).toBe(false)
  })
})

describe('addRecoveryFactor', () => {
  it('stores only wrapped bytes and a salt, never an unwrapped key', async () => {
    await addRecoveryFactor('user-1', {
      type: 'recovery_kit',
      label: 'Backup kit',
      wrappedMasterKey: 'd3JhcHBlZC1ieXRlcw==',
      salt: 'c2FsdA==',
    })

    const payload = inserted.mock.calls[0][0] as Record<string, unknown>
    expect(payload.wrapped_master_key).toBe('d3JhcHBlZC1ieXRlcw==')
    expect(payload.salt).toBe('c2FsdA==')
    // No column carries the secret or an unwrapped key.
    expect(Object.keys(payload)).toEqual(
      expect.not.arrayContaining(['master_key', 'secret', 'recovery_code', 'plaintext'])
    )
  })

  it('clears an earlier decline, because the user changed their mind', async () => {
    await addRecoveryFactor('user-1', {
      type: 'recovery_kit',
      label: 'Backup kit',
      wrappedMasterKey: 'w',
      salt: 's',
    })

    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ recovery_setup_declined_at: null })
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'recovery_factor_added' })
    )
    expect(notifySecurityEvent).toHaveBeenCalled()
  })
})

describe('confirmRecoveryFactor', () => {
  it('records the confirmation on the factor and the account', async () => {
    await confirmRecoveryFactor('user-1', 'factor-1')

    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ recovery_last_confirmed_at: expect.any(String) })
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'recovery_factor_confirmed' })
    )
  })
})

describe('declineRecoverySetup', () => {
  it('records the informed decline with an audit entry that states the consequence', async () => {
    await declineRecoverySetup('user-1')

    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ recovery_setup_declined_at: expect.any(String) })
    )
    const entry = createAuditEntry.mock.calls[0][0] as { action: string }
    expect(entry.action).toMatch(/permanently unreadable/i)
  })
})
