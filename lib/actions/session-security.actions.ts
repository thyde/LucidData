'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  consumeStepUp,
  listSessions,
  revokeSession,
  type SessionSummary,
  type StepUpAction,
} from '@/lib/services/session-security.service'
import { requestStepUp } from '@/lib/services/session-security.service'
import {
  requestStepUpSchema,
  revokeSessionSchema,
} from '@luciddata/core/validations/session-security'

async function requireUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return { id: user.id, email: user.email ?? '' }
}

/**
 * LD-106: exchange a fresh password proof for a single-use grant for one action.
 *
 * The browser re-enters the password with Supabase directly and sends only the
 * resulting access token, so the password never reaches this server.
 */
export async function requestStepUpAction(input: unknown): Promise<{ token: string } | ActionFailure> {
  return guarded(async () => {
    const user = await requireUser()
    const { action, proof } = requestStepUpSchema.parse(input)
    return { token: await requestStepUp(user.id, action, proof) }
  })
}

/** Verify a grant on behalf of an action handler. Throws when it is not valid. */
export async function assertStepUpAction(
  action: StepUpAction,
  token: string
): Promise<void | ActionFailure> {
  return guarded(async () => {
    const user = await requireUser()
    await consumeStepUp(user.id, action, token)
  })
}

export async function listSessionsAction(): Promise<SessionSummary[] | ActionFailure> {
  return guarded(async () => {
    const user = await requireUser()
    return listSessions(user.id)
  })
}

export async function revokeSessionAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const user = await requireUser()
    const { sessionId, stepUpToken } = revokeSessionSchema.parse(input)
    await consumeStepUp(user.id, 'revoke_session', stepUpToken)
    await revokeSession(user.id, sessionId)
  })
}
