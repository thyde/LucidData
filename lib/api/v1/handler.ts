import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js'
import { runWithAccessToken } from '@/lib/supabase/server'
import { UserFacingError } from '@/lib/actions/action-result'
import { consumeRateLimit } from '@/lib/services/rate-limit.service'
import { decodeSessionId, isSessionRevoked } from '@/lib/services/session-security.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

/**
 * LD-608: the wrapper every /api/v1 handler runs inside.
 *
 * It authenticates the bearer token with Supabase, refuses what the web app
 * refuses (a revoked session, or a session that skipped a second factor the
 * account has), rate limits per person, and runs the handler with a database
 * client that acts as the token's owner, so row level security applies. A
 * handler gets the user id from here and never from the request.
 *
 * Errors follow the server action rule: a UserFacingError's message is the
 * response, a validation error lists what was wrong, and anything else is a
 * generic 500 whose detail stays in the server log.
 */

export interface V1Context<P> {
  userId: string
  email: string
  params: P
}

type Handler<P> = (req: NextRequest, ctx: V1Context<P>) => Promise<unknown>

const NO_STORE = { 'cache-control': 'no-store' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UserFacingError codes that mean something more specific than a bad request. */
const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  conflict: 409,
  already_stored: 409,
  recovery_required: 409,
  health_consent_required: 403,
  step_up_required: 403,
  rate_limited: 429,
}

export function apiError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status, headers: NO_STORE })
}

export function notFound(): NextResponse {
  return apiError(404, 'Not found', { code: 'not_found' })
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'unauthorized' },
    { status: 401, headers: { ...NO_STORE, 'www-authenticate': 'Bearer' } }
  )
}

function bearerToken(req: NextRequest): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec((req.headers.get('authorization') ?? '').trim())
  return match ? match[1] : null
}

/** One claim from a token Supabase has already validated. */
function claim(token: string, name: string): unknown {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return (payload as Record<string, unknown>)[name]
  } catch {
    return undefined
  }
}

/** An account with a verified second factor must use a session that completed it. */
function lacksSecondFactor(token: string, user: User): boolean {
  const enrolled = (user.factors ?? []).some((factor) => factor.status === 'verified')
  return enrolled && claim(token, 'aal') !== 'aal2'
}

/** Read a JSON body, refusing anything else with a message the caller can act on. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new UserFacingError('The request body must be JSON', 'invalid_input')
  }
}

/** Each field that failed validation and what was wrong with it, for a response body. */
export function zodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

export function errorResponse(error: unknown, userId?: string): NextResponse {
  if (error instanceof ZodError) {
    return apiError(400, 'Invalid input', { code: 'invalid_input', issues: zodIssues(error) })
  }
  if (error instanceof UserFacingError) {
    const status = (error.code && STATUS_BY_CODE[error.code]) || 400
    return apiError(status, error.message, error.code ? { code: error.code } : {})
  }
  errorLogger.log(error, ErrorSeverity.HIGH, { userId, action: 'API_V1_ERROR' })
  return apiError(500, 'Something went wrong. Try again.', { code: 'internal' })
}

export function v1<P extends Record<string, string> = Record<string, never>>(
  handler: Handler<P>,
  options: { status?: number } = {}
) {
  // Next type-checks route exports, and requires the second argument to be
  // exactly `{ params: Promise<...> }`. Static routes receive an empty object.
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<NextResponse> => {
    const token = bearerToken(req)
    if (!token) return unauthorized()

    const auth = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    )
    const { data, error } = await auth.auth.getUser(token)
    if (error || !data.user) return unauthorized()
    const user = data.user

    const sessionId = decodeSessionId(token)
    if (sessionId && (await isSessionRevoked(sessionId))) return unauthorized()
    if (lacksSecondFactor(token, user)) {
      return apiError(401, 'Two-factor verification is required', { code: 'mfa_required' })
    }
    if (!(await consumeRateLimit('clientApi', user.id))) {
      return apiError(429, 'Too many requests. Try again shortly.', { code: 'rate_limited' })
    }

    try {
      const params = ((await context?.params) ?? {}) as P
      // A path id that is not a UUID cannot name anything, so it is a 404
      // rather than a database error.
      const id = (params as Record<string, string>).id
      if (id !== undefined && !UUID.test(id)) return notFound()

      const result = await runWithAccessToken(token, () =>
        handler(req, { userId: user.id, email: user.email ?? '', params })
      )
      if (result instanceof Response) return result as NextResponse
      return NextResponse.json(
        { data: result ?? null },
        { status: options.status ?? 200, headers: NO_STORE }
      )
    } catch (caught) {
      return errorResponse(caught, user.id)
    }
  }
}
