import { describe, it, expect, beforeEach, vi } from 'vitest'

const findUserById = vi.fn()
const updateUser = vi.fn()
const createAuditEntry = vi.fn()
const notifySecurityEvent = vi.fn()
const consumeStepUp = vi.fn()

interface Call {
  client: 'session' | 'service'
  table: string
  op: 'select' | 'count' | 'insert' | 'update' | 'delete'
  payload?: Record<string, unknown>
  filters: Record<string, unknown>
  order?: { column: string; ascending: boolean }
}

/** What the fake database holds for the test that is running. */
const db = {
  escrow: null as string | null,
  codeFactors: 0,
  factorRows: [] as Record<string, unknown>[],
  vaultCount: 0,
  probe: null as Record<string, unknown> | null,
  deleted: { id: 'factor-1', type: 'recovery_kit' } as Record<string, unknown> | null,
  retired: [] as Record<string, unknown>[],
  confirmed: { id: 'factor-1' } as Record<string, unknown> | null,
}
const calls: Call[] = []

function respond(call: Call, mode: 'many' | 'single' | 'maybeSingle') {
  const key = `${call.table}:${call.op}`
  switch (key) {
    case 'users:select':
      return { data: { wrapped_master_key: db.escrow }, error: null }
    case 'users:update':
      return { error: null }
    case 'recovery_factors:count':
      return { count: db.codeFactors, error: null }
    case 'recovery_factors:select':
      return { data: db.factorRows, error: null }
    case 'recovery_factors:insert':
      return {
        data: {
          id: 'factor-new',
          type: call.payload?.type,
          label: call.payload?.label,
          created_at: '2026-10-08T00:00:00.000Z',
          last_confirmed_at: '2026-10-08T00:00:00.000Z',
        },
        error: null,
      }
    case 'recovery_factors:delete':
      return mode === 'many' ? { data: db.retired, error: null } : { data: db.deleted, error: null }
    case 'recovery_factors:update':
      return { data: db.confirmed, error: null }
    case 'vault_data:count':
      return { count: db.vaultCount, error: null }
    case 'vault_data:select':
      return { data: db.probe, error: null }
    default:
      throw new Error(`Unexpected query ${key} (${mode})`)
  }
}

function fakeClient(client: Call['client']) {
  return {
    from(table: string) {
      const call: Call = { client, table, op: 'select', filters: {} }
      calls.push(call)
      const chain = {
        select(_columns?: string, options?: { head?: boolean }) {
          if (call.op === 'select' && options?.head) call.op = 'count'
          return chain
        },
        insert(payload: Record<string, unknown>) {
          call.op = 'insert'
          call.payload = payload
          return chain
        },
        update(payload: Record<string, unknown>) {
          call.op = 'update'
          call.payload = payload
          return chain
        },
        delete() {
          call.op = 'delete'
          return chain
        },
        eq(column: string, value: unknown) {
          call.filters[column] = value
          return chain
        },
        order(column: string, options: { ascending: boolean }) {
          call.order = { column, ascending: options.ascending }
          return chain
        },
        limit: () => chain,
        single: () => Promise.resolve(respond(call, 'single')),
        maybeSingle: () => Promise.resolve(respond(call, 'maybeSingle')),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve()
            .then(() => respond(call, 'many'))
            .then(resolve, reject),
      }
      return chain
    },
  }
}

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
vi.mock('@/lib/services/session-security.service', () => ({
  consumeStepUp: (...a: unknown[]) => consumeStepUp(...a),
  STEP_UP_REQUIRED: 'step_up_required',
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient('session') }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => fakeClient('service') }))

const {
  getRecoveryStatus,
  assertRecoveryReadyForFirstWrite,
  addRecoveryFactor,
  storeRecoveryCode,
  removeRecoveryFactor,
  confirmRecoveryFactor,
  retireRecoveryFactors,
  getRecoveryMaterial,
  declineRecoverySetup,
  CONFIRMATION_INTERVAL_DAYS,
} = await import('@/lib/services/recovery-factor.service')

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    key_salt: 'a2V5LXNhbHQ=',
    wrapped_master_key: null,
    recovery_code_salt: null,
    recovery_setup_declined_at: null,
    recovery_last_confirmed_at: null,
    ...overrides,
  }
}

const writes = () => calls.filter((call) => !['select', 'count'].includes(call.op))

const factorRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'f1',
  type: 'recovery_code',
  label: 'Recovery code',
  created_at: '2026-07-25T00:00:00.000Z',
  last_confirmed_at: '2026-07-25T00:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  calls.length = 0
  Object.assign(db, {
    escrow: null,
    codeFactors: 0,
    factorRows: [],
    vaultCount: 0,
    probe: null,
    deleted: { id: 'factor-1', type: 'recovery_kit' },
    retired: [],
    confirmed: { id: 'factor-1' },
  })
  findUserById.mockReset().mockResolvedValue(user())
  updateUser.mockReset().mockResolvedValue(undefined)
  createAuditEntry.mockReset().mockResolvedValue(undefined)
  notifySecurityEvent.mockReset().mockResolvedValue(undefined)
  consumeStepUp.mockReset().mockResolvedValue(undefined)
})

describe('assertRecoveryReadyForFirstWrite', () => {
  it('blocks a new user with no factor and no decline', async () => {
    await expect(assertRecoveryReadyForFirstWrite('user-1')).rejects.toMatchObject({
      code: 'recovery_required',
    })
  })

  it('allows a user who has a factor', async () => {
    db.factorRows = [factorRow()]
    await expect(assertRecoveryReadyForFirstWrite('user-1')).resolves.toBeUndefined()
  })

  it('allows a user who explicitly declined', async () => {
    findUserById.mockResolvedValue(user({ recovery_setup_declined_at: '2026-07-25T00:00:00.000Z' }))
    await expect(assertRecoveryReadyForFirstWrite('user-1')).resolves.toBeUndefined()
  })

  it('never blocks a user who already holds vault data', async () => {
    db.vaultCount = 12
    await expect(assertRecoveryReadyForFirstWrite('user-1')).resolves.toBeUndefined()
  })
})

describe('getRecoveryStatus', () => {
  it('asks for confirmation once the interval has passed', async () => {
    const stale = new Date(
      Date.now() - (CONFIRMATION_INTERVAL_DAYS + 1) * 24 * 60 * 60 * 1000
    ).toISOString()
    findUserById.mockResolvedValue(user({ recovery_last_confirmed_at: stale }))
    db.factorRows = [factorRow({ created_at: stale, last_confirmed_at: stale })]

    expect((await getRecoveryStatus('user-1')).confirmationDue).toBe(true)
  })

  it('does not ask for confirmation when there is nothing to confirm', async () => {
    const status = await getRecoveryStatus('user-1')
    expect(status.factors).toEqual([])
    expect(status.confirmationDue).toBe(false)
  })
})

describe('storeRecoveryCode', () => {
  const code = { wrappedMasterKey: 'd3JhcHBlZA==', salt: 'c2FsdA==' }

  it('sets up a first code without a grant, as the escrow and a factor holding the same bytes', async () => {
    await storeRecoveryCode('user-1', code)

    expect(consumeStepUp).not.toHaveBeenCalled()
    const escrow = writes().find((call) => call.table === 'users')!
    expect(escrow).toMatchObject({ client: 'service', op: 'update', filters: { id: 'user-1' } })
    expect(escrow.payload).toMatchObject({
      wrapped_master_key: code.wrappedMasterKey,
      recovery_code_salt: code.salt,
      recovery_setup_declined_at: null,
    })
    const inserted = writes().find((call) => call.op === 'insert')!
    expect(inserted).toMatchObject({ client: 'service', table: 'recovery_factors' })
    expect(inserted.payload).toMatchObject({
      user_id: 'user-1',
      type: 'recovery_code',
      wrapped_master_key: code.wrappedMasterKey,
      salt: code.salt,
    })
    // One code, one record of it.
    expect(createAuditEntry).toHaveBeenCalledTimes(1)
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'recovery_codes_generated' })
    )
    expect(notifySecurityEvent).toHaveBeenCalledTimes(1)
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'recovery_code_generated')
  })

  it('refuses to replace a code without a grant, and changes nothing', async () => {
    db.escrow = 'b2xkLWNvZGU='

    await expect(storeRecoveryCode('user-1', code)).rejects.toMatchObject({
      code: 'step_up_required',
    })
    expect(writes()).toEqual([])
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('treats a code factor without escrow as a code to protect', async () => {
    db.codeFactors = 1

    await expect(storeRecoveryCode('user-1', code)).rejects.toMatchObject({
      code: 'step_up_required',
    })
  })

  it('replaces a code with a grant for add_recovery_factor', async () => {
    db.escrow = 'b2xkLWNvZGU='

    await storeRecoveryCode('user-1', code, 'grant')

    expect(consumeStepUp).toHaveBeenCalledWith('user-1', 'add_recovery_factor', 'grant')
    const cleared = writes().find((call) => call.op === 'delete')!
    expect(cleared.filters).toEqual({ user_id: 'user-1', type: 'recovery_code' })
  })

  it('stops when the grant is refused', async () => {
    db.escrow = 'b2xkLWNvZGU='
    consumeStepUp.mockRejectedValue(new Error('Confirm your password again to continue'))

    await expect(storeRecoveryCode('user-1', code, 'used-grant')).rejects.toThrow(/Confirm/)
    expect(writes()).toEqual([])
  })
})

describe('addRecoveryFactor', () => {
  const kit = { type: 'recovery_kit' as const, label: 'Backup kit', wrappedMasterKey: 'w', salt: 's' }

  it('needs a grant to add a kit', async () => {
    await expect(addRecoveryFactor('user-1', kit)).rejects.toMatchObject({ code: 'step_up_required' })
    expect(writes()).toEqual([])
  })

  it('stores only wrapped bytes and a salt, never an unwrapped key', async () => {
    await addRecoveryFactor('user-1', { ...kit, wrappedMasterKey: 'd3JhcHBlZC1ieXRlcw==', stepUpToken: 'grant' })

    expect(consumeStepUp).toHaveBeenCalledWith('user-1', 'add_recovery_factor', 'grant')
    const inserted = writes().find((call) => call.op === 'insert')!
    expect(inserted.client).toBe('service')
    expect(inserted.payload).toMatchObject({
      user_id: 'user-1',
      wrapped_master_key: 'd3JhcHBlZC1ieXRlcw==',
      salt: 's',
    })
    expect(Object.keys(inserted.payload!)).toEqual(
      expect.not.arrayContaining(['master_key', 'secret', 'recovery_code', 'plaintext'])
    )
  })

  it('clears an earlier decline, and says a kit was added rather than a code', async () => {
    await addRecoveryFactor('user-1', { ...kit, stepUpToken: 'grant' })

    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ recovery_setup_declined_at: null })
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'recovery_factor_added' })
    )
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'recovery_kit_added')
  })

  it('stores a recovery code through the escrow, so the two never disagree', async () => {
    await addRecoveryFactor('user-1', {
      type: 'recovery_code',
      label: 'Recovery code',
      wrappedMasterKey: 'w',
      salt: 's',
    })

    expect(writes().some((call) => call.table === 'users' && call.payload?.wrapped_master_key === 'w')).toBe(
      true
    )
  })
})

describe('removeRecoveryFactor', () => {
  it('needs a grant for remove_recovery_factor', async () => {
    await expect(removeRecoveryFactor('user-1', 'factor-1', '')).rejects.toMatchObject({
      code: 'step_up_required',
    })
    expect(writes()).toEqual([])

    await removeRecoveryFactor('user-1', 'factor-1', 'grant')
    expect(consumeStepUp).toHaveBeenCalledWith('user-1', 'remove_recovery_factor', 'grant')
  })

  it('removes only the caller\'s factor, and tells them', async () => {
    await removeRecoveryFactor('user-1', 'factor-1', 'grant')

    const removed = writes().find((call) => call.op === 'delete')!
    expect(removed).toMatchObject({
      client: 'service',
      table: 'recovery_factors',
      filters: { id: 'factor-1', user_id: 'user-1' },
    })
    // A kit is not the escrow, so the escrow stays.
    expect(writes().some((call) => call.table === 'users')).toBe(false)
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'recovery_factor_removed' })
    )
    expect(notifySecurityEvent).toHaveBeenCalledWith('user-1', 'recovery_factor_removed')
  })

  it('clears the escrow along with the recovery code, so the code stops working', async () => {
    db.deleted = { id: 'factor-1', type: 'recovery_code' }

    await removeRecoveryFactor('user-1', 'factor-1', 'grant')

    const escrow = writes().find((call) => call.table === 'users')!
    expect(escrow).toMatchObject({ client: 'service', filters: { id: 'user-1' } })
    expect(escrow.payload).toMatchObject({ wrapped_master_key: null, recovery_code_salt: null })
  })

  it('reports a factor that is not there, without recording anything', async () => {
    db.deleted = null

    await expect(removeRecoveryFactor('user-1', 'missing', 'grant')).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(createAuditEntry).not.toHaveBeenCalled()
    expect(notifySecurityEvent).not.toHaveBeenCalled()
  })
})

describe('confirmRecoveryFactor', () => {
  it('records the confirmation on the factor and the account', async () => {
    await confirmRecoveryFactor('user-1', 'factor-1')

    expect(writes()[0]).toMatchObject({
      client: 'service',
      table: 'recovery_factors',
      op: 'update',
      filters: { id: 'factor-1', user_id: 'user-1' },
    })
    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ recovery_last_confirmed_at: expect.any(String) })
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'recovery_factor_confirmed' })
    )
  })

  it('never records recovery as confirmed for a factor that is not there', async () => {
    db.confirmed = null

    await expect(confirmRecoveryFactor('user-1', 'missing')).rejects.toMatchObject({
      message: 'Recovery factor not found',
      code: 'not_found',
    })
    expect(updateUser).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('retireRecoveryFactors', () => {
  it('removes every factor and the escrow, records which, and counts the kits', async () => {
    db.retired = [
      { id: 'code-1', type: 'recovery_code' },
      { id: 'kit-1', type: 'recovery_kit' },
      { id: 'kit-2', type: 'recovery_kit' },
    ]

    expect(await retireRecoveryFactors('user-1')).toEqual({ kits: 2 })

    const removed = writes().find((call) => call.op === 'delete')!
    expect(removed).toMatchObject({ client: 'service', filters: { user_id: 'user-1' } })
    const escrow = writes().find((call) => call.table === 'users')!
    expect(escrow.filters).toEqual({ id: 'user-1' })
    expect(escrow.payload).toMatchObject({ wrapped_master_key: null, recovery_code_salt: null })
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'recovery_factor_removed',
        metadata: { reason: 'vault_key_changed', factor_ids: ['code-1', 'kit-1', 'kit-2'] },
      })
    )
  })

  it('records nothing when there was nothing to retire', async () => {
    expect(await retireRecoveryFactors('user-1')).toEqual({ kits: 0 })
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('getRecoveryMaterial', () => {
  it('returns the wrapped copies and the oldest entry, read as the person', async () => {
    findUserById.mockResolvedValue(
      user({ wrapped_master_key: 'ZXNjcm93', recovery_code_salt: 'ZXNjcm93LXNhbHQ=' })
    )
    db.factorRows = [{ id: 'kit-1', type: 'recovery_kit', wrapped_master_key: 'a2l0', salt: 'a2l0LXNhbHQ=' }]
    db.probe = { encrypted_dek: 'ZGVr', dek_salt: 'aXY=' }

    const material = await getRecoveryMaterial('user-1')

    expect(material).toEqual({
      key_salt: 'a2V5LXNhbHQ=',
      escrow: { wrapped_master_key: 'ZXNjcm93', salt: 'ZXNjcm93LXNhbHQ=' },
      factors: [{ id: 'kit-1', type: 'recovery_kit', wrapped_master_key: 'a2l0', salt: 'a2l0LXNhbHQ=' }],
      probe: { encrypted_dek: 'ZGVr', dek_salt: 'aXY=' },
      ingest_key: null,
    })
    for (const call of calls) {
      expect(call.client).toBe('session')
      expect(call.filters.user_id).toBe('user-1')
    }
    const probe = calls.find((call) => call.table === 'vault_data')!
    expect(probe.order).toEqual({ column: 'created_at', ascending: true })
  })

  it('reports no escrow when only half of it is stored', async () => {
    findUserById.mockResolvedValue(user({ wrapped_master_key: 'ZXNjcm93' }))

    expect((await getRecoveryMaterial('user-1')).escrow).toBeNull()
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
