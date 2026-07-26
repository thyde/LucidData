'use server'

import { z } from 'zod'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  consumeStepUp,
  grantStepUp,
  listSessions,
  revokeSession,
  STEP_UP_ACTIONS,
  type SessionSummary,
  type StepUpAction,
} from '@/lib/services/session-security.service'
import { assertRateLimit } from '@/lib/services/rate-limit.service'

const stepUpActionSchema = z.enum(STEP_UP_ACTIONS)

const requestStepUpSchema = z.object({
  action: stepUpActionSchema,
  password: z.string().min(1),
})

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
  stepUpToken: z.string().min(1),
})

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
 * LD-106: re-prove the password and receive a single-use grant for one action.
 *
 * Verification runs against a throwaway client that persists nothing, so a wrong
 * password never disturbs the caller's live session and a correct one never
 * replaces it. The password never leaves this action.
 */
export async function requestStepUpAction(input: unknown): Promise<{ token: string }> {
  const user = await requireUser()
  const { action, password } = requestStepUpSchema.parse(input)

  // Throttle so this cannot be used to brute force the password.
  await assertRateLimit('verification', `stepup:${user.id}`)

  const throwaway = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } }
  )
  const { error } = await throwaway.auth.signInWithPassword({
    email: user.email,
    password,
  })
  if (error) throw new Error('Incorrect password')

  const token = await grantStepUp(user.id, action)
  return { token }
}

/** Verify a grant on behalf of an action handler. Throws when it is not valid. */
export async function assertStepUpAction(
  action: StepUpAction,
  token: string
): Promise<void> {
  const user = await requireUser()
  await consumeStepUp(user.id, action, token)
}

export async function listSessionsAction(): Promise<SessionSummary[]> {
  const user = await requireUser()
  return listSessions(user.id)
}

export async function revokeSessionAction(input: unknown): Promise<void> {
  const user = await requireUser()
  const { sessionId, stepUpToken } = revokeSessionSchema.parse(input)
  await consumeStepUp(user.id, 'revoke_session', stepUpToken)
  await revokeSession(user.id, sessionId)
}
