import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-301: a right with no case, no clock, and no appeal path is a promise
 * nobody can hold us to. These assert the transitions and the evidence.
 */

const cases = new Map<string, Record<string, unknown>>()
const events: Record<string, unknown>[] = []
const createAuditEntry = vi.fn()
let nextId = 0

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...args: unknown[]) => createAuditEntry(...args),
}))

vi.mock('@/lib/repositories/rights.repository', () => ({
  insertCase: (row: Record<string, unknown>) => {
    nextId += 1
    const record = {
      id: `case-${nextId}`,
      status: 'received',
      detail: null,
      extended_to: null,
      paused_at: null,
      resumed_at: null,
      paused_ms: 0,
      resolution: null,
      resolution_note: null,
      appeal_of_case_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    }
    cases.set(record.id as string, record)
    return Promise.resolve(record)
  },
  findCaseById: (id: string, userId: string) => {
    const record = cases.get(id)
    return Promise.resolve(record && record.user_id === userId ? record : null)
  },
  findCasesByUser: (userId: string) =>
    Promise.resolve([...cases.values()].filter((record) => record.user_id === userId)),
  findOpenCaseOfType: (userId: string, type: string) =>
    Promise.resolve(
      [...cases.values()].find(
        (record) =>
          record.user_id === userId &&
          record.type === type &&
          record.status !== 'fulfilled' &&
          record.status !== 'refused'
      ) ?? null
    ),
  updateCase: (id: string, userId: string, patch: Record<string, unknown>) => {
    const record = cases.get(id)
    if (!record || record.user_id !== userId) throw new Error('Request not found')
    const updated = { ...record, ...patch }
    cases.set(id, updated)
    return Promise.resolve(updated)
  },
  insertEvent: (row: Record<string, unknown>) => {
    const record = { id: `event-${events.length}`, created_at: new Date().toISOString(), ...row }
    events.push(record)
    return Promise.resolve(record)
  },
  findEventsByCase: (caseId: string) =>
    Promise.resolve(events.filter((event) => event.case_id === caseId)),
}))

const {
  fileRequest,
  listCases,
  getCase,
  pauseCase,
  resumeCase,
  extendCase,
  resolveCase,
  withdrawCase,
  appealCase,
} = await import('@/lib/services/rights.service')

const USER = 'user-1'

beforeEach(() => {
  cases.clear()
  events.length = 0
  nextId = 0
  vi.clearAllMocks()
  createAuditEntry.mockResolvedValue(undefined)
})

function eventsFor(caseId: string): string[] {
  return events.filter((event) => event.case_id === caseId).map((event) => event.event as string)
}

describe('filing a request', () => {
  it('starts the clock from the jurisdiction', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    const due = new Date(record.due_at as string).getTime()
    const received = new Date(record.received_at as string).getTime()
    // One month, so between 28 and 31 days.
    expect(due - received).toBeGreaterThan(27 * 86_400_000)
    expect(due - received).toBeLessThan(32 * 86_400_000)
  })

  it('gives California a longer window than the EU', async () => {
    const eu = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    const ca = await fileRequest('user-2', { type: 'access', jurisdiction: 'us_ca' })
    expect(new Date(ca.due_at as string).getTime()).toBeGreaterThan(
      new Date(eu.due_at as string).getTime()
    )
  })

  it('records the filing as evidence and in the audit chain', async () => {
    const record = await fileRequest(USER, { type: 'deletion', jurisdiction: 'uk' })
    expect(eventsFor(record.id)).toEqual(['received'])
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, eventType: 'rights_case_updated' })
    )
  })

  it('refuses a duplicate open request of the same type', async () => {
    await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await expect(fileRequest(USER, { type: 'access', jurisdiction: 'eu' })).rejects.toThrow(
      'already have an open request'
    )
  })

  it('allows a new request once the previous one closed', async () => {
    const first = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await resolveCase(USER, first.id, 'fulfilled')
    await expect(fileRequest(USER, { type: 'access', jurisdiction: 'eu' })).resolves.toBeTruthy()
  })
})

describe('pausing and resuming', () => {
  it('does not accrue time while paused', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'uk' })
    const before = (await getCase(USER, record.id))!.daysRemaining

    await pauseCase(USER, record.id, 'We need proof of identity')
    const paused = cases.get(record.id)!
    // Backdate the pause by five days to simulate waiting.
    paused.paused_at = new Date(Date.now() - 5 * 86_400_000).toISOString()

    const after = (await getCase(USER, record.id))!.daysRemaining
    expect(after).toBeGreaterThanOrEqual(before + 4)
  })

  it('folds a completed pause into the stored total', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'uk' })
    await pauseCase(USER, record.id, 'Need clarification')
    cases.get(record.id)!.paused_at = new Date(Date.now() - 3 * 86_400_000).toISOString()

    const resumed = await resumeCase(USER, record.id)
    expect(resumed.status).toBe('in_progress')
    expect(Number(resumed.paused_ms)).toBeGreaterThan(2.5 * 86_400_000)
    expect(eventsFor(record.id)).toEqual(['received', 'paused', 'resumed'])
  })

  it('refuses to pause where the jurisdiction does not stop the clock', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'us_ca' })
    await expect(pauseCase(USER, record.id, 'reason')).rejects.toThrow('cannot be paused')
  })

  it('refuses to pause a closed case', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await resolveCase(USER, record.id, 'fulfilled')
    await expect(pauseCase(USER, record.id, 'reason')).rejects.toThrow('already closed')
  })
})

describe('extending', () => {
  it('moves the deadline out and records the ground', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    const before = new Date(record.due_at as string).getTime()
    const extended = await extendCase(USER, record.id, 'The request is numerous')
    expect(new Date(extended.due_at as string).getTime()).toBeGreaterThan(before)
    expect(eventsFor(record.id)).toContain('extended')
    expect(events.find((event) => event.event === 'extended')?.detail).toBe(
      'The request is numerous'
    )
  })

  it('can only be done once', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await extendCase(USER, record.id, 'reason')
    await expect(extendCase(USER, record.id, 'reason')).rejects.toThrow('already been extended')
  })
})

describe('resolving', () => {
  it('requires a refusal to state its reason', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    // "No" without a reason cannot be appealed.
    await expect(resolveCase(USER, record.id, 'refused')).rejects.toThrow('must state its reason')
    await expect(resolveCase(USER, record.id, 'refused', '   ')).rejects.toThrow(
      'must state its reason'
    )
  })

  it('closes a fulfilled case', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    const resolved = await resolveCase(USER, record.id, 'fulfilled')
    expect(resolved.status).toBe('fulfilled')
    expect((await getCase(USER, record.id))!.canWithdraw).toBe(false)
  })

  it('lets a person withdraw their own open request', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    const withdrawn = await withdrawCase(USER, record.id)
    expect(withdrawn.resolution).toBe('withdrawn')
    expect(eventsFor(record.id)).toContain('withdrawn')
  })
})

describe('appealing', () => {
  it('creates its own case with its own clock', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await resolveCase(USER, record.id, 'refused', 'We could not verify your identity')

    const appeal = await appealCase(USER, record.id, 'I sent my passport twice')
    expect(appeal.type).toBe('appeal')
    expect(appeal.appeal_of_case_id).toBe(record.id)
    expect(new Date(appeal.received_at as string).getTime()).toBeGreaterThanOrEqual(
      new Date(record.received_at as string).getTime()
    )
    expect(cases.get(record.id)!.status).toBe('appealed')
  })

  it('only applies to a refusal', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await expect(appealCase(USER, record.id, 'because')).rejects.toThrow(
      'Only a refused request can be appealed'
    )
  })

  it('cannot itself be appealed', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await resolveCase(USER, record.id, 'refused', 'reason')
    const appeal = await appealCase(USER, record.id, 'because')
    await resolveCase(USER, appeal.id, 'refused', 'still no')
    await expect(appealCase(USER, appeal.id, 'again')).rejects.toThrow(
      'An appeal cannot itself be appealed'
    )
  })

  it('records the appeal on both cases', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await resolveCase(USER, record.id, 'refused', 'reason')
    const appeal = await appealCase(USER, record.id, 'because')
    expect(eventsFor(record.id)).toContain('appealed')
    expect(eventsFor(appeal.id)).toEqual(['received'])
  })
})

describe('ownership', () => {
  it('will not touch another person\u2019s case', async () => {
    const record = await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await expect(resolveCase('someone-else', record.id, 'fulfilled')).rejects.toThrow(
      'Request not found'
    )
    await expect(withdrawCase('someone-else', record.id)).rejects.toThrow('Request not found')
    expect(await getCase('someone-else', record.id)).toBeNull()
  })

  it('lists only the requesting person\u2019s cases', async () => {
    await fileRequest(USER, { type: 'access', jurisdiction: 'eu' })
    await fileRequest('user-2', { type: 'access', jurisdiction: 'eu' })
    const mine = await listCases(USER)
    expect(mine).toHaveLength(1)
    expect(mine[0].case.user_id).toBe(USER)
  })
})
