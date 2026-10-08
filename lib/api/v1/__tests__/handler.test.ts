import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const { getUser, clientOptions, consumeRateLimit, isSessionRevoked, logError } = vi.hoisted(() => ({
  getUser: vi.fn(),
  clientOptions: [] as unknown[],
  consumeRateLimit: vi.fn(),
  isSessionRevoked: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options: unknown) => {
    clientOptions.push(options)
    return { auth: { getUser } }
  },
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/services/rate-limit.service', () => ({ consumeRateLimit }))
vi.mock('@/lib/services/session-security.service', () => ({
  isSessionRevoked,
  decodeSessionId: (token: string | null) => (token ? claims(token).session_id ?? null : null),
}))
vi.mock('@/lib/services/error-logger', () => ({
  errorLogger: { log: logError },
  ErrorSeverity: { HIGH: 'high' },
}))

import { v1, readJson } from '@/lib/api/v1/handler'
import { createClient } from '@/lib/supabase/server'
import { UserFacingError } from '@/lib/actions/action-result'

function claims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

function token(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256' })}.${part(payload)}.signature`
}

const USER = { id: 'user-1', email: 'person@example.com', factors: [] }
const TOKEN = token({ sub: USER.id, session_id: 'session-1', aal: 'aal1' })

function request(headers: Record<string, string> = {}, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/thing', {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
}

const authed = (body?: unknown) => request({ authorization: `Bearer ${TOKEN}` }, body)

const NO_PARAMS = { params: Promise.resolve({} as Record<string, never>) }

beforeEach(() => {
  vi.clearAllMocks()
  clientOptions.length = 0
  getUser.mockResolvedValue({ data: { user: USER }, error: null })
  consumeRateLimit.mockResolvedValue(true)
  isSessionRevoked.mockResolvedValue(false)
})

describe('authentication', () => {
  it('refuses a request with no token, without running the handler', async () => {
    const handler = vi.fn()
    const response = await v1(handler)(request(), NO_PARAMS)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(handler).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('refuses a scheme other than bearer', async () => {
    const response = await v1(vi.fn())(request({ authorization: `Basic ${TOKEN}` }), NO_PARAMS)
    expect(response.status).toBe(401)
  })

  it('refuses a token Supabase does not accept', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') })
    const handler = vi.fn()

    const response = await v1(handler)(authed(), NO_PARAMS)

    expect(response.status).toBe(401)
    expect(getUser).toHaveBeenCalledWith(TOKEN)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a token from a revoked session', async () => {
    isSessionRevoked.mockResolvedValue(true)
    const response = await v1(vi.fn())(authed(), NO_PARAMS)

    expect(response.status).toBe(401)
    expect(isSessionRevoked).toHaveBeenCalledWith('session-1')
  })

  it('asks for the second factor an account has, as the web app does', async () => {
    getUser.mockResolvedValue({
      data: { user: { ...USER, factors: [{ status: 'verified' }] } },
      error: null,
    })
    const response = await v1(vi.fn())(authed(), NO_PARAMS)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'mfa_required' })
  })

  it('accepts a session that completed the second factor', async () => {
    getUser.mockResolvedValue({
      data: { user: { ...USER, factors: [{ status: 'verified' }] } },
      error: null,
    })
    const strong = token({ sub: USER.id, session_id: 'session-1', aal: 'aal2' })

    const response = await v1(async () => 'ok')(request({ authorization: `Bearer ${strong}` }), NO_PARAMS)

    expect(response.status).toBe(200)
  })

  it('rate limits per person', async () => {
    consumeRateLimit.mockResolvedValue(false)
    const handler = vi.fn()

    const response = await v1(handler)(authed(), NO_PARAMS)

    expect(response.status).toBe(429)
    expect(consumeRateLimit).toHaveBeenCalledWith('clientApi', USER.id)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('running the handler', () => {
  it('takes the user from the token, never from the request', async () => {
    const handler = vi.fn(async (_req: NextRequest, ctx: { userId: string; email: string }) => ({
      userId: ctx.userId,
      email: ctx.email,
    }))

    const response = await v1(handler)(authed({ userId: 'someone-else', user_id: 'someone-else' }), NO_PARAMS)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: { userId: USER.id, email: USER.email },
    })
  })

  it('gives services a database client that acts as the token owner', async () => {
    let options: unknown
    const handler = v1(async () => {
      await createClient()
      options = clientOptions.at(-1)
      return null
    })

    await handler(authed(), NO_PARAMS)

    expect(options).toMatchObject({
      global: { headers: { Authorization: `Bearer ${TOKEN}` } },
      auth: { persistSession: false },
    })
  })

  it('sends the success status a route asks for, and never caches', async () => {
    const response = await v1(async () => ({ id: 'x' }), { status: 201 })(authed(), NO_PARAMS)

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('passes a response the handler built straight through', async () => {
    const response = await v1(async () => new Response('teapot', { status: 418 }))(authed(), NO_PARAMS)
    expect(response.status).toBe(418)
  })

  it('treats an id that is not a UUID as not found, without running the handler', async () => {
    const handler = vi.fn()
    const response = await v1<{ id: string }>(handler)(authed(), {
      params: Promise.resolve({ id: '1 OR 1=1' }),
    })

    expect(response.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('errors', () => {
  it('sends a message written for the person as the response', async () => {
    const response = await v1(async () => {
      throw new UserFacingError('This request has already been answered', 'conflict')
    })(authed(), NO_PARAMS)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This request has already been answered',
      code: 'conflict',
    })
  })

  it.each([
    ['not_found', 404],
    ['health_consent_required', 403],
    ['step_up_required', 403],
    ['recovery_required', 409],
    [undefined, 400],
  ])('maps the %s code to %i', async (code, status) => {
    const response = await v1(async () => {
      throw new UserFacingError('Refused', code)
    })(authed(), NO_PARAMS)
    expect(response.status).toBe(status)
  })

  it('lists what was wrong with invalid input', async () => {
    const response = await v1(async (req) => z.object({ label: z.string() }).parse(await readJson(req)))(
      authed({ label: 7 }),
      NO_PARAMS
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('invalid_input')
    expect(body.issues[0].path).toBe('label')
  })

  it('refuses a body that is not JSON', async () => {
    const response = await v1(async (req) => readJson(req))(authed('not json'), NO_PARAMS)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_input' })
  })

  it('keeps an internal error out of the response and in the log', async () => {
    const response = await v1(async () => {
      throw new Error('relation "vault_data" does not exist at 10.0.0.4')
    })(authed(), NO_PARAMS)

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain('vault_data')
    expect(text).not.toContain('10.0.0.4')
    expect(logError).toHaveBeenCalledWith(
      expect.any(Error),
      'high',
      expect.objectContaining({ userId: USER.id, action: 'API_V1_ERROR' })
    )
  })
})
