import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openHealthShare: vi.fn(),
  assertRateLimit: vi.fn(),
}))

vi.mock('@/lib/services/health-share.service', () => ({ openHealthShare: mocks.openHealthShare }))
vi.mock('@/lib/services/rate-limit.service', async () => {
  const { UserFacingError } = await import('@/lib/actions/action-result')
  class RateLimitError extends UserFacingError {}
  return {
    assertRateLimit: mocks.assertRateLimit,
    clientKeyFromHeaders: (headers: Headers) => headers.get('x-forwarded-for') ?? 'unknown-client',
    RateLimitError,
  }
})

const { GET } = await import('@/app/api/share/[id]/route')
const { RateLimitError } = await import('@/lib/services/rate-limit.service')

const ID = '3f2a0c4e-1b5d-4c6e-8f70-9a1b2c3d4e5f'

function call(id: string) {
  const request = new Request(`http://localhost/api/share/${id}`, { headers: { 'x-forwarded-for': '203.0.113.7' } })
  return GET(request as unknown as Parameters<typeof GET>[0], { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertRateLimit.mockResolvedValue(undefined)
})

describe('GET /api/share/[id]', () => {
  it('returns the ciphertext of an open share, uncached and unindexed', async () => {
    mocks.openHealthShare.mockResolvedValue({
      state: 'open',
      ciphertext: 'c2VhbGVk',
      expiresAt: '2026-10-08T12:00:00.000Z',
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    const response = await call(ID)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      state: 'open',
      ciphertext: 'c2VhbGVk',
      expiresAt: '2026-10-08T12:00:00.000Z',
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.assertRateLimit).toHaveBeenCalledWith('verification', '203.0.113.7')
    expect(mocks.openHealthShare).toHaveBeenCalledWith(ID)
  })

  it.each(['revoked', 'expired'] as const)('says a %s share is gone, and returns nothing else', async (state) => {
    mocks.openHealthShare.mockResolvedValue({ state })
    const response = await call(ID)
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ state })
  })

  it('says when a share does not exist', async () => {
    mocks.openHealthShare.mockResolvedValue({ state: 'missing' })
    const response = await call(ID)
    expect(response.status).toBe(404)
  })

  it('never looks up something that is not a share id', async () => {
    const response = await call('not-a-share')
    expect(response.status).toBe(404)
    expect(mocks.openHealthShare).not.toHaveBeenCalled()
  })

  it('is rate limited before anything is looked up', async () => {
    mocks.assertRateLimit.mockRejectedValue(new RateLimitError('Too many requests. Try again shortly.'))
    const response = await call(ID)
    expect(response.status).toBe(429)
    expect(mocks.openHealthShare).not.toHaveBeenCalled()
  })

  it('reads an uppercase id as the same share', async () => {
    mocks.openHealthShare.mockResolvedValue({ state: 'missing' })
    await call(ID.toUpperCase())
    expect(mocks.openHealthShare).toHaveBeenCalledWith(ID)
  })
})
