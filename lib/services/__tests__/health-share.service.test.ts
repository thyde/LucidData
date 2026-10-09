import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  countOpenShares: vi.fn(),
  insertShare: vi.fn(),
  deleteShare: vi.fn(),
  findShareForUser: vi.fn(),
  findSharesForUser: vi.fn(),
  openShare: vi.fn(),
  clearExpiredShares: vi.fn(),
  createConsent: vi.fn(),
  deleteConsent: vi.fn(),
  issueConsentReceipt: vi.fn(),
  createAuditEntry: vi.fn(),
  revokeConsent: vi.fn(),
  assertRateLimit: vi.fn(),
  log: vi.fn(),
}))

vi.mock('@/lib/repositories/health-share.repository', () => ({
  countOpenShares: mocks.countOpenShares,
  insertShare: mocks.insertShare,
  deleteShare: mocks.deleteShare,
  findShareForUser: mocks.findShareForUser,
  findSharesForUser: mocks.findSharesForUser,
  openShare: mocks.openShare,
  clearExpiredShares: mocks.clearExpiredShares,
}))
vi.mock('@/lib/repositories/consent.repository', () => ({
  createConsent: mocks.createConsent,
  deleteConsent: mocks.deleteConsent,
}))
vi.mock('@/lib/services/consent-receipt.service', () => ({ issueConsentReceipt: mocks.issueConsentReceipt }))
vi.mock('@/lib/services/audit.service', () => ({ createAuditEntry: mocks.createAuditEntry }))
vi.mock('@/lib/services/consent.service', () => ({ revokeConsent: mocks.revokeConsent }))
vi.mock('@/lib/services/rate-limit.service', () => ({ assertRateLimit: mocks.assertRateLimit }))
vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low' },
  errorLogger: { log: mocks.log },
}))

const {
  createHealthShare,
  openHealthShare,
  purgeExpiredHealthShares,
  revokeHealthShare,
  sharePurpose,
} = await import('@/lib/services/health-share.service')
const { UserFacingError } = await import('@/lib/actions/action-result')

const USER = '00000000-0000-4000-8000-0000000000a1'
const NOW = new Date('2026-10-01T12:00:00.000Z')
const INPUT = {
  ciphertext: 'oKGio6SlpqeoqaqrpzgPRSS5Z9tCFvK+ahuyp0qMYTymhnBM73pD9gyLGm/yRHfNmQ9jBHKvNOapL296tKNBfzHKVwseqikn',
  metrics: ['steps', 'sleep_hours'] as ('steps' | 'sleep_hours')[],
  rangeStart: '2026-09-01',
  rangeEnd: '2026-09-30',
  expiresInDays: 7 as const,
  label: 'Dr. Patel',
}
const CONSENT = { id: 'consent-1', user_id: USER, granted_to_name: 'Dr. Patel' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertRateLimit.mockResolvedValue(undefined)
  mocks.countOpenShares.mockResolvedValue(0)
  mocks.createConsent.mockResolvedValue(CONSENT)
  mocks.insertShare.mockResolvedValue(undefined)
  mocks.deleteShare.mockResolvedValue(undefined)
  mocks.deleteConsent.mockResolvedValue(undefined)
  mocks.issueConsentReceipt.mockResolvedValue({ receipt: { id: 'receipt-1' } })
  mocks.createAuditEntry.mockResolvedValue({})
})

describe('createHealthShare', () => {
  it('stores the ciphertext behind a consent, with a receipt and an audit entry', async () => {
    const created = await createHealthShare(USER, INPUT, NOW)

    expect(created.expiresAt).toBe('2026-10-08T12:00:00.000Z')
    expect(mocks.assertRateLimit).toHaveBeenCalledWith('healthShare', USER)
    expect(mocks.createConsent).toHaveBeenCalledWith({
      user_id: USER,
      granted_to: `link:${created.id}`,
      granted_to_name: 'Dr. Patel',
      access_level: 'export',
      purpose: 'A health summary shared by link: Steps and Sleep, from 2026-09-01 to 2026-09-30.',
      data_category: 'health',
      end_date: '2026-10-08T12:00:00.000Z',
      consent_type: 'explicit',
    })
    expect(mocks.insertShare).toHaveBeenCalledWith({
      id: created.id,
      user_id: USER,
      consent_id: 'consent-1',
      ciphertext: INPUT.ciphertext,
      metrics: ['steps', 'sleep_hours'],
      range_start: '2026-09-01',
      range_end: '2026-09-30',
      expires_at: '2026-10-08T12:00:00.000Z',
    })
    expect(mocks.issueConsentReceipt).toHaveBeenCalledWith(CONSENT, 'granted')
    expect(mocks.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, eventType: 'consent_granted', consentId: 'consent-1' })
    )
    expect(mocks.deleteConsent).not.toHaveBeenCalled()
  })

  it('names nobody when the person gives no label', async () => {
    await createHealthShare(USER, { ...INPUT, label: undefined }, NOW)
    expect(mocks.createConsent).toHaveBeenCalledWith(expect.objectContaining({ granted_to_name: 'Anyone with the link' }))
  })

  it('refuses an eleventh open share and stores nothing', async () => {
    mocks.countOpenShares.mockResolvedValue(10)
    await expect(createHealthShare(USER, INPUT, NOW)).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.createConsent).not.toHaveBeenCalled()
    expect(mocks.insertShare).not.toHaveBeenCalled()
  })

  it('stops at the daily limit before anything is stored', async () => {
    mocks.assertRateLimit.mockRejectedValue(new UserFacingError('Too many requests. Try again shortly.', 'rate_limited'))
    await expect(createHealthShare(USER, INPUT, NOW)).rejects.toThrow('Too many requests')
    expect(mocks.createConsent).not.toHaveBeenCalled()
  })

  it('removes the consent when the share cannot be stored', async () => {
    mocks.insertShare.mockRejectedValue(new Error('insert failed'))
    await expect(createHealthShare(USER, INPUT, NOW)).rejects.toThrow('insert failed')
    expect(mocks.deleteConsent).toHaveBeenCalledWith('consent-1', USER)
    expect(mocks.deleteShare).not.toHaveBeenCalled()
    expect(mocks.issueConsentReceipt).not.toHaveBeenCalled()
  })

  it('removes both when the receipt cannot be issued, so no share opens without one', async () => {
    mocks.issueConsentReceipt.mockRejectedValue(new Error('signing key unavailable'))
    await expect(createHealthShare(USER, INPUT, NOW)).rejects.toThrow('signing key unavailable')
    const [[shareId]] = mocks.insertShare.mock.calls.map(([share]) => [share.id])
    expect(mocks.deleteShare).toHaveBeenCalledWith(shareId, USER)
    expect(mocks.deleteConsent).toHaveBeenCalledWith('consent-1', USER)
    expect(mocks.createAuditEntry).not.toHaveBeenCalled()
  })

  it('gives every share its own id', async () => {
    const one = await createHealthShare(USER, INPUT, NOW)
    const two = await createHealthShare(USER, INPUT, NOW)
    expect(one.id).not.toBe(two.id)
  })
})

describe('revokeHealthShare', () => {
  const share = { id: 'share-1', consent_id: 'consent-1', revoked_at: null }

  it('revokes the consent behind the share', async () => {
    mocks.findShareForUser.mockResolvedValueOnce(share).mockResolvedValueOnce({ ...share, revoked_at: '2026-10-02T00:00:00Z' })
    const revoked = await revokeHealthShare(USER, 'share-1')
    expect(mocks.revokeConsent).toHaveBeenCalledWith('consent-1', USER, 'You revoked the shared health summary.')
    expect(revoked.revoked_at).toBe('2026-10-02T00:00:00Z')
  })

  it('does nothing twice', async () => {
    mocks.findShareForUser.mockResolvedValue({ ...share, revoked_at: '2026-10-02T00:00:00Z' })
    await revokeHealthShare(USER, 'share-1')
    expect(mocks.revokeConsent).not.toHaveBeenCalled()
  })

  it('refuses a share the person does not have', async () => {
    mocks.findShareForUser.mockResolvedValue(null)
    await expect(revokeHealthShare(USER, 'share-9')).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.revokeConsent).not.toHaveBeenCalled()
  })
})

describe('openHealthShare', () => {
  const opened = {
    state: 'open',
    ciphertext: 'c2VhbGVk',
    expiresAt: '2026-10-08T12:00:00.000Z',
    createdAt: '2026-10-01T12:00:00.000Z',
    userId: USER,
    consentId: 'consent-1',
    previousViewAt: null,
  }

  it('returns only what the recipient needs, and records the first view', async () => {
    mocks.openShare.mockResolvedValue(opened)
    const result = await openHealthShare('share-1', NOW)
    expect(result).toEqual({
      state: 'open',
      ciphertext: 'c2VhbGVk',
      expiresAt: '2026-10-08T12:00:00.000Z',
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    expect(mocks.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, eventType: 'health_share_viewed', consentId: 'consent-1', actorType: 'system' })
    )
  })

  it('records a reload within the hour only once', async () => {
    mocks.openShare.mockResolvedValue({ ...opened, previousViewAt: '2026-10-01T11:30:00.000Z' })
    await openHealthShare('share-1', NOW)
    expect(mocks.createAuditEntry).not.toHaveBeenCalled()
  })

  it('records a view after an hour', async () => {
    mocks.openShare.mockResolvedValue({ ...opened, previousViewAt: '2026-10-01T10:59:00.000Z' })
    await openHealthShare('share-1', NOW)
    expect(mocks.createAuditEntry).toHaveBeenCalledTimes(1)
  })

  it('still opens when the audit entry fails', async () => {
    mocks.openShare.mockResolvedValue(opened)
    mocks.createAuditEntry.mockRejectedValue(new Error('audit down'))
    await expect(openHealthShare('share-1', NOW)).resolves.toMatchObject({ state: 'open' })
    expect(mocks.log).toHaveBeenCalled()
  })

  it.each(['missing', 'revoked', 'expired'] as const)('returns nothing but the state of a %s share', async (state) => {
    mocks.openShare.mockResolvedValue(state === 'missing' ? { state } : { state, expiresAt: opened.expiresAt })
    await expect(openHealthShare('share-1', NOW)).resolves.toEqual({ state })
    expect(mocks.createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('the rest', () => {
  it('states the terms in words', () => {
    expect(sharePurpose(['steps'], '2026-09-01', '2026-09-30')).toBe(
      'A health summary shared by link: Steps, from 2026-09-01 to 2026-09-30.'
    )
    expect(sharePurpose(['steps', 'sleep_hours', 'weight_kg'], '2026-09-01', '2026-09-30')).toBe(
      'A health summary shared by link: Steps, Sleep and Weight, from 2026-09-01 to 2026-09-30.'
    )
  })

  it('purges expired ciphertext', async () => {
    mocks.clearExpiredShares.mockResolvedValue(2)
    await expect(purgeExpiredHealthShares(NOW)).resolves.toBe(2)
    expect(mocks.clearExpiredShares).toHaveBeenCalledWith(NOW)
  })
})
