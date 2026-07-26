import { describe, it, expect, beforeEach, vi } from 'vitest'

const findDuePayouts = vi.fn()
const findAccount = vi.fn()
const updatePayout = vi.fn()
const findPoolById = vi.fn()
const transfersCreate = vi.fn()
const isStripeConfigured = vi.fn()
const createAuditEntry = vi.fn()
const notifyPayoutPaid = vi.fn()
const notifyPayoutFailed = vi.fn()
const logSpy = vi.fn()

const consentUpdate = vi.fn()
const shareUpdate = vi.fn()
const jobRunInsert = vi.fn()

type Stubbed = ReturnType<typeof vi.fn> & { result?: { data: unknown[]; error: null } }

vi.mock('@/lib/repositories/payout.repository', () => ({
  findDuePayouts: (...a: unknown[]) => findDuePayouts(...a),
  findAccount: (...a: unknown[]) => findAccount(...a),
  updatePayout: (...a: unknown[]) => updatePayout(...a),
}))

vi.mock('@/lib/repositories/pool.repository', () => ({
  findPoolById: (...a: unknown[]) => findPoolById(...a),
}))

vi.mock('@/lib/stripe/client', () => ({
  isStripeConfigured: () => isStripeConfigured(),
  getStripe: () => ({ transfers: { create: (...a: unknown[]) => transfersCreate(...a) } }),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/services/marketplace-notification.service', () => ({
  notifyPayoutPaid: (...a: unknown[]) => notifyPayoutPaid(...a),
  notifyPayoutFailed: (...a: unknown[]) => notifyPayoutFailed(...a),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: (...a: unknown[]) => logSpy(...a) },
}))

vi.mock('@/lib/services/rate-limit.service', () => ({
  purgeExpiredRateLimits: () => Promise.resolve(0),
}))

vi.mock('@/lib/services/retention.service', () => ({
  runRetentionPurges: () => Promise.resolve({ results: [], failed: 0 }),
}))

vi.mock('@/lib/services/webhook.service', () => ({
  dispatchDueDeliveries: () => Promise.resolve({ processed: 0, failed: 0 }),
}))

vi.mock('@/lib/services/bulk-job.service', () => ({
  runBulkJobs: () => Promise.resolve({ processed: 0, failed: 0 }),
  purgeOldBulkJobs: () => Promise.resolve(0),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'job_runs') {
        return { insert: (row: unknown) => Promise.resolve(jobRunInsert(row)) }
      }
      const handler = (table === 'consents' ? consentUpdate : shareUpdate) as Stubbed
      const chain = {
        update: (patch: unknown) => {
          handler(patch)
          return chain
        },
        is: () => chain,
        eq: () => chain,
        not: () => chain,
        lt: () => chain,
        select: () => Promise.resolve(handler.result ?? { data: [], error: null }),
      }
      return chain
    },
  }),
}))

const {
  backoffMsForAttempt,
  runPayoutRetries,
  runConsentExpiry,
  runShareExpiry,
  runScheduledJobs,
  isJobName,
  MAX_PAYOUT_ATTEMPTS,
} = await import('@/lib/services/scheduled-jobs.service')

function payout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payout-1',
    user_id: 'user-1',
    pool_id: 'pool-1',
    // Above the payout threshold, so the sweep actually attempts a transfer.
    amount_cents: 5000,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  findDuePayouts.mockReset().mockResolvedValue([])
  findAccount
    .mockReset()
    .mockResolvedValue({ stripe_account_id: 'acct_1', payouts_enabled: true })
  updatePayout.mockReset().mockResolvedValue(undefined)
  findPoolById.mockReset().mockResolvedValue({ name: 'Fitness pool' })
  transfersCreate.mockReset().mockResolvedValue({ id: 'tr_1' })
  isStripeConfigured.mockReset().mockReturnValue(true)
  createAuditEntry.mockReset().mockResolvedValue(undefined)
  notifyPayoutPaid.mockReset().mockResolvedValue(undefined)
  notifyPayoutFailed.mockReset().mockResolvedValue(undefined)
  logSpy.mockReset()
  consentUpdate.mockReset()
  shareUpdate.mockReset()
  jobRunInsert.mockReset().mockReturnValue({ error: null })
  ;(consentUpdate as Stubbed).result = { data: [], error: null }
  ;(shareUpdate as Stubbed).result = { data: [], error: null }
})

describe('backoffMsForAttempt', () => {
  it('doubles each attempt from a five minute base', () => {
    expect(backoffMsForAttempt(1)).toBe(5 * 60 * 1000)
    expect(backoffMsForAttempt(2)).toBe(10 * 60 * 1000)
    expect(backoffMsForAttempt(3)).toBe(20 * 60 * 1000)
    expect(backoffMsForAttempt(4)).toBe(40 * 60 * 1000)
  })

  it('caps at one day', () => {
    expect(backoffMsForAttempt(20)).toBe(24 * 60 * 60 * 1000)
  })
})

describe('runPayoutRetries', () => {
  it('does nothing when Stripe is not configured', async () => {
    isStripeConfigured.mockReturnValue(false)
    const result = await runPayoutRetries()
    expect(result).toEqual({ job: 'payout_retries', processed: 0, failed: 0 })
    expect(findDuePayouts).not.toHaveBeenCalled()
  })

  it('marks a successful transfer paid and clears the retry state', async () => {
    findDuePayouts.mockResolvedValue([payout()])
    const result = await runPayoutRetries()

    expect(result.processed).toBe(1)
    expect(updatePayout).toHaveBeenCalledWith(
      'payout-1',
      expect.objectContaining({
        status: 'paid',
        stripe_transfer_id: 'tr_1',
        attempts: 1,
        last_error: null,
        next_attempt_at: null,
      })
    )
    expect(notifyPayoutPaid).toHaveBeenCalled()
  })

  it('leaves a failed transfer pending with a backoff deadline', async () => {
    findDuePayouts.mockResolvedValue([payout()])
    transfersCreate.mockRejectedValue(new Error('balance_insufficient'))

    const result = await runPayoutRetries()

    expect(result.failed).toBe(1)
    const patch = updatePayout.mock.calls[0][1] as Record<string, unknown>
    expect(patch.status).toBe('pending')
    expect(patch.attempts).toBe(1)
    expect(patch.next_attempt_at).toEqual(expect.any(String))
    expect(notifyPayoutFailed).not.toHaveBeenCalled()
  })

  it('fails the payout, logs, and notifies once retries are exhausted', async () => {
    findDuePayouts.mockResolvedValue([payout({ attempts: MAX_PAYOUT_ATTEMPTS - 1 })])
    transfersCreate.mockRejectedValue(new Error('account_invalid'))

    await runPayoutRetries()

    const patch = updatePayout.mock.calls[0][1] as Record<string, unknown>
    expect(patch.status).toBe('failed')
    expect(patch.next_attempt_at).toBeNull()
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(notifyPayoutFailed).toHaveBeenCalledTimes(1)
  })

  it('skips a contributor who has not finished payout onboarding', async () => {
    findDuePayouts.mockResolvedValue([payout()])
    findAccount.mockResolvedValue({ stripe_account_id: 'acct_1', payouts_enabled: false })

    const result = await runPayoutRetries()

    expect(transfersCreate).not.toHaveBeenCalled()
    expect(updatePayout).not.toHaveBeenCalled()
    expect(result).toEqual({ job: 'payout_retries', processed: 0, failed: 0 })
  })

  it('holds a balance below the payout threshold instead of sending it', async () => {
    findDuePayouts.mockResolvedValue([payout({ amount_cents: 300 })])

    const result = await runPayoutRetries()

    expect(transfersCreate).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
  })

  it('sends once several small payouts add up past the threshold', async () => {
    findDuePayouts.mockResolvedValue([
      payout({ id: 'p1', amount_cents: 1500 }),
      payout({ id: 'p2', amount_cents: 1500 }),
    ])

    const result = await runPayoutRetries()

    expect(transfersCreate).toHaveBeenCalledTimes(2)
    expect(result.processed).toBe(2)
  })

  it('is idempotent: a second sweep finds nothing left due', async () => {
    findDuePayouts.mockResolvedValueOnce([payout()]).mockResolvedValueOnce([])
    const first = await runPayoutRetries()
    const second = await runPayoutRetries()
    expect(first.processed).toBe(1)
    expect(second.processed).toBe(0)
  })
})

describe('runConsentExpiry', () => {
  it('stamps expired grants and audits each one', async () => {
    ;(consentUpdate as Stubbed).result = {
      data: [
        { id: 'c1', user_id: 'user-1', granted_to: 'acme', granted_to_name: 'Acme' },
        { id: 'c2', user_id: 'user-2', granted_to: 'globex', granted_to_name: null },
      ],
      error: null,
    }

    const result = await runConsentExpiry()

    expect(result.processed).toBe(2)
    expect(consentUpdate).toHaveBeenCalledWith({ expired_at: expect.any(String) })
    expect(createAuditEntry).toHaveBeenCalledTimes(2)
  })

  it('is idempotent: a second sweep matches nothing', async () => {
    ;(consentUpdate as Stubbed).result = { data: [], error: null }
    const result = await runConsentExpiry()
    expect(result.processed).toBe(0)
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('runShareExpiry', () => {
  it('stamps expired share tokens', async () => {
    ;(shareUpdate as Stubbed).result = { data: [{ id: 's1' }], error: null }
    const result = await runShareExpiry()
    expect(result.processed).toBe(1)
    expect(shareUpdate).toHaveBeenCalledWith({ expired_at: expect.any(String) })
  })
})

describe('runScheduledJobs', () => {
  it('runs every job and records each run', async () => {
    const results = await runScheduledJobs()
    expect(results.map((r) => r.job)).toEqual([
      'payout_retries',
      'consent_expiry',
      'share_expiry',
      'rate_limit_purge',
      'retention_purge',
      'webhook_delivery',
      'bulk_operations',
    ])
    expect(jobRunInsert).toHaveBeenCalledTimes(7)
  })

  it('reports a failing job without stopping the sweep', async () => {
    findDuePayouts.mockRejectedValue(new Error('database unreachable'))
    const results = await runScheduledJobs()
    expect(results).toHaveLength(7)
    expect(results[0].error).toBe('database unreachable')
    expect(results[1].error).toBeUndefined()
  })

  it('runs a single named job when asked', async () => {
    const results = await runScheduledJobs('share_expiry')
    expect(results).toHaveLength(1)
    expect(results[0].job).toBe('share_expiry')
  })
})

describe('isJobName', () => {
  it('accepts known jobs and rejects anything else', () => {
    expect(isJobName('consent_expiry')).toBe(true)
    expect(isJobName('drop_everything')).toBe(false)
  })
})
