import { randomBytes, createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { createAuditEntry } from '@/lib/services/audit.service'

/**
 * LD-106 session security and step-up authentication.
 *
 * A warm session is not enough for a destructive action. The user re-proves
 * their password, which mints a single-use grant naming exactly one action.
 * Grants are never cached across actions, so confirming an export does not
 * silently authorize deleting the account.
 */

/** Actions that require fresh authentication, not just an active session. */
export const STEP_UP_ACTIONS = [
  'export_vault',
  'revoke_consent',
  'change_password',
  'add_recovery_factor',
  'delete_account',
  'revoke_session',
] as const

export type StepUpAction = (typeof STEP_UP_ACTIONS)[number]

/** How long a confirmation stays usable. Short: it authorizes one action now. */
export const STEP_UP_TTL_SECONDS = 120

export function isStepUpAction(value: string): value is StepUpAction {
  return (STEP_UP_ACTIONS as readonly string[]).includes(value)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
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
    throw new Error('Confirm your password again to continue')
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
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const currentSessionId = decodeSessionId(session?.access_token ?? null)

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
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}
