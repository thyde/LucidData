import { randomBytes, createHash } from 'crypto'
import { STEP_UP_ACTIONS, type StepUpAction } from '@luciddata/core/validations/session-security'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient, currentAccessToken } from '@/lib/supabase/server'
import { createAuditEntry } from '@/lib/services/audit.service'
import { assertRateLimit } from '@/lib/services/rate-limit.service'
import { UserFacingError } from '@/lib/actions/action-result'

/**
 * LD-106 session security and step-up authentication.
 *
 * A warm session is not enough for a destructive action. The user re-proves
 * their password, which mints a single-use grant naming exactly one action.
 * Grants are never cached across actions, so confirming an export does not
 * silently authorize deleting the account.
 */

export { STEP_UP_ACTIONS }
export type { StepUpAction }

/** The error code for an action refused because it needs a fresh password confirmation. */
export const STEP_UP_REQUIRED = 'step_up_required'

/** How long a confirmation stays usable. Short: it authorizes one action now. */
export const STEP_UP_TTL_SECONDS = 120

/** How recently the password sign-in behind a step-up proof must have happened. */
export const PASSWORD_PROOF_MAX_AGE_SECONDS = 120

export function isStepUpAction(value: string): value is StepUpAction {
  return (STEP_UP_ACTIONS as readonly string[]).includes(value)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * LD-106: accept a step-up only from a password sign-in the browser made moments
 * ago. The browser sends that session's access token, not the password, so the
 * password never reaches our servers. Supabase validates the token, and the
 * session is then deleted, so each proof works once.
 */
export async function verifyPasswordProof(
  userId: string,
  action: StepUpAction,
  proof: string
): Promise<void> {
  if (await acceptPasswordProof(userId, proof)) return
  await createAuditEntry({
    userId,
    eventType: 'step_up_failed',
    action: `Re-authentication failed for ${action}`,
    success: false,
    metadata: { step_up_action: action },
  }).catch(() => undefined)
  throw new UserFacingError('Confirm your password again to continue', STEP_UP_REQUIRED)
}

async function acceptPasswordProof(userId: string, proof: string): Promise<boolean> {
  const claims = decodeClaims(proof)
  const proofSessionId = typeof claims?.session_id === 'string' ? claims.session_id : null
  const signedInAt = claims ? passwordSignInTime(claims) : null
  if (!proofSessionId || signedInAt === null) return false
  if (Date.now() / 1000 - signedInAt > PASSWORD_PROOF_MAX_AGE_SECONDS) return false

  const supabase = await createClient()
  // Never accept, and so never delete, the session this request is made with.
  if (proofSessionId === decodeSessionId(await currentAccessToken())) return false

  const { data, error } = await supabase.auth.getUser(proof)
  if (error || data.user?.id !== userId) return false

  const { data: ended, error: endError } = await supabase.rpc('revoke_my_session', {
    p_session_id: proofSessionId,
  })
  return !endError && ended === true
}

/** When the token's session last proved the password, from Supabase's `amr` claim. */
function passwordSignInTime(claims: Record<string, unknown>): number | null {
  if (!Array.isArray(claims.amr)) return null
  const entry = claims.amr.find(
    (item): item is { method: string; timestamp: unknown } =>
      typeof item === 'object' && item !== null && item.method === 'password'
  )
  return typeof entry?.timestamp === 'number' ? entry.timestamp : null
}

/**
 * Mint a grant for one action. The caller must already have verified the user's
 * password; this function does not authenticate on its own.
 */
export async function grantStepUp(userId: string, action: StepUpAction): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const service = createServiceClient()
  const { error } = await service.from('step_up_grants').insert({
    user_id: userId,
    action,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + STEP_UP_TTL_SECONDS * 1000).toISOString(),
  })
  if (error) throw error
  return token
}

/**
 * Exchange a fresh password proof for a single-use grant for one action. Rate
 * limited, because each attempt asks Supabase to check a sign-in.
 */
export async function requestStepUp(
  userId: string,
  action: StepUpAction,
  proof: string
): Promise<string> {
  await assertRateLimit('verification', `stepup:${userId}`)
  await verifyPasswordProof(userId, action, proof)
  return grantStepUp(userId, action)
}

/**
 * Consume a grant for one action. Single use: the update only succeeds while the
 * grant is unconsumed, so a replayed token fails.
 */
export async function consumeStepUp(
  userId: string,
  action: StepUpAction,
  token: string
): Promise<void> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('step_up_grants')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .eq('user_id', userId)
    .eq('action', action)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) {
    await createAuditEntry({
      userId,
      eventType: 'step_up_failed',
      action: `Re-authentication failed for ${action}`,
      success: false,
      metadata: { step_up_action: action },
    }).catch(() => undefined)
    throw new UserFacingError('Confirm your password again to continue', STEP_UP_REQUIRED)
  }
}

export interface SessionSummary {
  id: string
  createdAt: string
  lastSeenAt: string | null
  userAgent: string | null
  ip: string | null
  current: boolean
}

/**
 * Active sessions for the user, read through a SECURITY DEFINER function that
 * scopes itself to auth.uid(). The caller therefore cannot list anyone else's
 * sessions even by tampering with arguments, because there are none.
 */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  void userId
  const supabase = await createClient()
  const currentSessionId = decodeSessionId(await currentAccessToken())

  const { data, error } = await supabase.rpc('list_my_sessions')

  // Degrade to showing only the current session rather than failing the page.
  if (error || !data) {
    return currentSessionId
      ? [
          {
            id: currentSessionId,
            createdAt: new Date().toISOString(),
            lastSeenAt: null,
            userAgent: null,
            ip: null,
            current: true,
          },
        ]
      : []
  }

  return data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastSeenAt: row.updated_at,
    userAgent: row.user_agent,
    ip: row.ip,
    current: row.id === currentSessionId,
  }))
}

/**
 * End a session everywhere. The auth session and its refresh token are deleted
 * so the browser cannot mint a new access token, and the id is recorded so an
 * access token still held in that browser is rejected before it expires.
 */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const service = createServiceClient()

  const { error: markError } = await service
    .from('revoked_sessions')
    .upsert({ session_id: sessionId, user_id: userId }, { onConflict: 'session_id' })
  if (markError) throw markError

  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_my_session', { p_session_id: sessionId })
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'session_revoked',
    action: 'Ended a signed-in session',
    metadata: { session_id: sessionId },
  })
}

export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('revoked_sessions')
    .select('session_id')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

/**
 * Read the session id from a Supabase access token. The token is a JWT whose
 * payload carries a `session_id` claim. Signature verification is not needed
 * here: Supabase already validated the token, and this value is only used to
 * mark the caller's own session as current.
 */
export function decodeSessionId(accessToken: string | null): string | null {
  const claims = decodeClaims(accessToken)
  return typeof claims?.session_id === 'string' ? claims.session_id : null
}

function decodeClaims(accessToken: string | null): Record<string, unknown> | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
