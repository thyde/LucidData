import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUser = vi.fn()
const hasHealthDataConsent = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

vi.mock('@/lib/services/legal.service', () => ({
  hasHealthDataConsent: (...args: unknown[]) => hasHealthDataConsent(...args),
}))

const authorize = await import('@/app/api/connectors/[provider]/authorize/route')
const callback = await import('@/app/api/connectors/[provider]/callback/route')

function request(url: string) {
  return new Request(url) as unknown as Parameters<typeof authorize.GET>[0]
}

function params(provider: string) {
  return { params: Promise.resolve({ provider }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('starting a grant for an active provider', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends someone without health data consent to give it first', async () => {
    hasHealthDataConsent.mockResolvedValue(false)
    const res = await authorize.GET(
      request('https://app.example/api/connectors/strava/authorize'),
      params('strava')
    )

    expect(hasHealthDataConsent).toHaveBeenCalledWith('user-1')
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.origin).toBe('https://app.example')
    expect(location.pathname).toBe('/settings')
    expect(location.searchParams.get('health_consent')).toBe('required')
    expect(location.hash).toBe('#health-data-consent')
  })

  it('goes on to the provider once consent is given', async () => {
    hasHealthDataConsent.mockResolvedValue(true)
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-1')
    vi.stubEnv('CONNECTOR_TOKEN_SECRET', Buffer.alloc(32, 1).toString('base64'))
    const res = await authorize.GET(
      request('https://app.example/api/connectors/strava/authorize'),
      params('strava')
    )

    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('/settings')
    expect(location).toContain('strava.com')
  })
})

describe('a retired provider', () => {
  it('cannot start a grant', async () => {
    const res = await authorize.GET(
      request('http://localhost/api/connectors/fitbit/authorize'),
      params('fitbit')
    )

    expect(res.status).toBe(410)
    expect((await res.json()).error).toContain('Fitbit Web API')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('cannot finish a grant that was already in flight', async () => {
    const res = await callback.GET(
      request('http://localhost/api/connectors/fitbit/callback?code=code&state=state'),
      params('fitbit')
    )

    expect(res.headers.get('location')).toContain('connector=retired')
    expect(getUser).not.toHaveBeenCalled()
  })
})
