import { describe, it, expect, vi } from 'vitest'

const getUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

const authorize = await import('@/app/api/connectors/[provider]/authorize/route')
const callback = await import('@/app/api/connectors/[provider]/callback/route')

function request(url: string) {
  return new Request(url) as unknown as Parameters<typeof authorize.GET>[0]
}

function params(provider: string) {
  return { params: Promise.resolve({ provider }) }
}

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
