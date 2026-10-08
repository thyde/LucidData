import { describe, it, expect, beforeEach, vi } from 'vitest'

const insertAcceptances = vi.fn()
const findAcceptancesByUser = vi.fn()
const createAuditEntry = vi.fn()
const listSources = vi.fn()
const disconnectSource = vi.fn()

vi.mock('@/lib/repositories/legal-acceptance.repository', () => ({
  insertAcceptances: (...args: unknown[]) => insertAcceptances(...args),
  findAcceptancesByUser: (...args: unknown[]) => findAcceptancesByUser(...args),
}))
vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...args: unknown[]) => createAuditEntry(...args),
}))
vi.mock('@/lib/services/connector.service', () => ({
  listSources: (...args: unknown[]) => listSources(...args),
  disconnectSource: (...args: unknown[]) => disconnectSource(...args),
}))

const legal = await import('@/lib/services/legal.service')
const { LEGAL_DOCUMENTS, HEALTH_CONSENT_REQUIRED, HEALTH_DATA_CONSENT_VERSION } = await import(
  '@/lib/constants/legal'
)

const TERMS = LEGAL_DOCUMENTS.terms.version
const PRIVACY = LEGAL_DOCUMENTS.privacy.version

function row(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    organization_id: null,
    document: 'terms',
    version: TERMS,
    action: 'accepted',
    source: 'registration',
    recorded_at: '2026-10-08T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  insertAcceptances.mockResolvedValue(undefined)
  createAuditEntry.mockResolvedValue({})
  findAcceptancesByUser.mockResolvedValue([])
  listSources.mockResolvedValue([])
  disconnectSource.mockResolvedValue(undefined)
})

describe('summarizeAcceptances', () => {
  it('uses the highest accepted version of each document', () => {
    const status = legal.summarizeAcceptances([
      row({ version: TERMS, recorded_at: '2026-10-08T00:00:00Z' }),
      row({ version: '2026-01-01', recorded_at: '2026-10-09T00:00:00Z' }),
      row({ document: 'privacy', version: PRIVACY }),
    ] as never)
    expect(status.accepted.terms?.version).toBe(TERMS)
    expect(status.outstanding).toEqual([])
  })

  it('reads health consent from the most recent record, so a withdrawal wins', () => {
    const status = legal.summarizeAcceptances([
      row({ document: 'health-data', action: 'accepted', recorded_at: '2026-10-08T00:00:00Z' }),
      row({ document: 'health-data', action: 'withdrawn', recorded_at: '2026-10-09T00:00:00Z' }),
    ] as never)
    expect(status.healthConsent.granted).toBe(false)
    expect(status.healthConsent.recordedAt).toBe('2026-10-09T00:00:00Z')
  })
})

describe('recordRegistrationChoices', () => {
  const signedUpAt = '2026-10-08T12:00:00Z'

  it('records the versions the form showed, dated to sign-up', async () => {
    const recorded = await legal.recordRegistrationChoices(
      'user-1',
      { legal: { terms: TERMS, privacy: PRIVACY, health_data: HEALTH_DATA_CONSENT_VERSION } },
      signedUpAt
    )
    expect(recorded).toEqual(['terms', 'privacy'])
    const rows = insertAcceptances.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows.map((r) => r.document)).toEqual(['terms', 'privacy', 'health-data'])
    for (const inserted of rows) {
      expect(inserted).toMatchObject({ user_id: 'user-1', source: 'registration', recorded_at: signedUpAt })
    }
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'health_data_consent_granted' })
    )
  })

  it('leaves health data consent out unless the box was ticked', async () => {
    await legal.recordRegistrationChoices('user-1', { legal: { terms: TERMS, privacy: PRIVACY } }, signedUpAt)
    const rows = insertAcceptances.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows.some((r) => r.document === 'health-data')).toBe(false)
  })

  it('ignores a version nobody could have been shown', async () => {
    await legal.recordRegistrationChoices(
      'user-1',
      { legal: { terms: '2999-01-01', privacy: 'latest' } },
      signedUpAt
    )
    expect(insertAcceptances).toHaveBeenCalledWith([])
  })

  it('does not record the same document twice', async () => {
    findAcceptancesByUser.mockResolvedValue([row({ document: 'terms' })])
    const recorded = await legal.recordRegistrationChoices(
      'user-1',
      { legal: { terms: TERMS, privacy: PRIVACY } },
      signedUpAt
    )
    expect(recorded).toEqual(['privacy'])
  })

  it('does nothing for an account created before the form asked', async () => {
    expect(await legal.recordRegistrationChoices('user-1', {}, signedUpAt)).toEqual([])
    expect(insertAcceptances).not.toHaveBeenCalled()
  })
})

describe('health data consent', () => {
  it('refuses with a code the browser can recognize', async () => {
    await expect(legal.assertHealthDataConsent('user-1')).rejects.toMatchObject({
      name: 'UserFacingError',
      code: HEALTH_CONSENT_REQUIRED,
    })
  })

  it('passes once consent is on record', async () => {
    findAcceptancesByUser.mockResolvedValue([row({ document: 'health-data' })])
    await expect(legal.assertHealthDataConsent('user-1')).resolves.toBeUndefined()
  })

  it('records a grant against the current policy version', async () => {
    await legal.grantHealthDataConsent('user-1', 'health-gate')
    expect(insertAcceptances).toHaveBeenCalledWith([
      { user_id: 'user-1', document: 'health-data', version: HEALTH_DATA_CONSENT_VERSION, source: 'health-gate' },
    ])
  })

  it('disconnects every source when consent is withdrawn, and appends rather than edits', async () => {
    listSources.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
    const result = await legal.withdrawHealthDataConsent('user-1')
    expect(result).toEqual({ disconnected: 2 })
    expect(disconnectSource).toHaveBeenCalledWith('user-1', 's1')
    expect(disconnectSource).toHaveBeenCalledWith('user-1', 's2')
    expect(insertAcceptances).toHaveBeenCalledWith([
      expect.objectContaining({ document: 'health-data', action: 'withdrawn' }),
    ])
  })
})

describe('acceptDocuments', () => {
  it('records the current versions from the prompt and audits them', async () => {
    await legal.acceptDocuments('user-1', ['privacy', 'privacy'])
    expect(insertAcceptances).toHaveBeenCalledWith([
      { user_id: 'user-1', document: 'privacy', version: PRIVACY, source: 'prompt' },
    ])
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'legal_terms_accepted' })
    )
  })
})
