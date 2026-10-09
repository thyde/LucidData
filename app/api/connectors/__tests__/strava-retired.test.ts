import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/services/legal.service', () => ({ hasHealthDataConsent: vi.fn() }))

const authorize = await import('@/app/api/connectors/[provider]/authorize/route')
const callback = await import('@/app/api/connectors/[provider]/callback/route')
const { availableConnectors } = await import('@/lib/services/connector.service')

function request(url: string) {
  return new Request(url) as unknown as Parameters<typeof authorize.GET>[0]
}

const params = { params: Promise.resolve({ provider: 'strava' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

// Strava's API Policy lets an app keep Strava data for seven days at most, and
// a vault keeps it for good, so the connector is retired for real. The
// archive import covers Strava instead.
describe('the retired Strava connector', () => {
  it('cannot start a grant, and says to import the archive instead', async () => {
    const res = await authorize.GET(request('http://localhost/api/connectors/strava/authorize'), params)

    expect(res.status).toBe(410)
    const { error } = await res.json()
    expect(error).toContain('seven days')
    expect(error).toContain('import your Strava archive')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('cannot finish a grant that was already in flight', async () => {
    const res = await callback.GET(
      request('http://localhost/api/connectors/strava/callback?code=code&state=state'),
      params
    )

    expect(res.headers.get('location')).toContain('connector=retired')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('is not offered, even with credentials configured', () => {
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-1')
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'secret-1')
    vi.stubEnv('CONNECTOR_TOKEN_SECRET', Buffer.alloc(32, 1).toString('base64'))
    try {
      expect(availableConnectors()).toEqual([])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
