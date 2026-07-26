import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.fn()
const deleteResult = vi.fn()
const logSpy = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => {
      const chain = {
        delete: () => chain,
        lt: () => chain,
        select: () => Promise.resolve(deleteResult()),
      }
      return chain
    },
  }),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: (...a: unknown[]) => logSpy(...a) },
}))

const {
  RATE_LIMITS,
  RateLimitError,
  assertRateLimit,
  consumeRateLimit,
  clientKeyFromHeaders,
  purgeExpiredRateLimits,
} = await import('@/lib/services/rate-limit.service')

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null })
  deleteResult.mockReset().mockReturnValue({ data: [], error: null })
  logSpy.mockReset()
})

describe('consumeRateLimit', () => {
  it('passes the configured window and limit for the named bucket', async () => {
    await consumeRateLimit('consentRequest', 'org-1')

    expect(rpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_bucket: 'consentRequest:org-1',
      p_window_seconds: RATE_LIMITS.consentRequest.windowSeconds,
      p_limit: RATE_LIMITS.consentRequest.limit,
    })
  })

  it('reports the limit as exceeded when the store says so', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(consumeRateLimit('consentRequest', 'org-1')).resolves.toBe(false)
  })

  it('fails open and logs when the store is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('connection refused') })

    await expect(consumeRateLimit('consentRequest', 'org-1')).resolves.toBe(true)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})

describe('assertRateLimit', () => {
  it('resolves while inside the limit', async () => {
    await expect(assertRateLimit('verification', 'org-1')).resolves.toBeUndefined()
  })

  it('throws a RateLimitError once the limit is exceeded', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(assertRateLimit('verification', 'org-1')).rejects.toBeInstanceOf(RateLimitError)
  })
})

describe('clientKeyFromHeaders', () => {
  it('uses the first forwarded address', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })
    expect(clientKeyFromHeaders(headers)).toBe('203.0.113.7')
  })

  it('falls back to the real ip header', () => {
    expect(clientKeyFromHeaders(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('never returns an empty key', () => {
    expect(clientKeyFromHeaders(new Headers())).toBe('unknown-client')
  })
})

describe('rate limit configuration', () => {
  it('gives every named limit a positive window and cap', () => {
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
      expect(config.windowSeconds, name).toBeGreaterThan(0)
      expect(config.limit, name).toBeGreaterThan(0)
    }
  })
})

describe('purgeExpiredRateLimits', () => {
  it('reports how many counters were dropped', async () => {
    deleteResult.mockReturnValue({ data: [{ bucket: 'a' }, { bucket: 'b' }], error: null })
    await expect(purgeExpiredRateLimits()).resolves.toBe(2)
  })
})
