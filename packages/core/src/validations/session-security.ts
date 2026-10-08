import { z } from 'zod'

/**
 * Actions that require fresh authentication, not just an active session. The
 * service that performs each one consumes the grant, so a client cannot skip it.
 *
 * change_password covers re-wrapping the vault's keys, after a password change
 * or a recovery. add_recovery_factor covers adding a kit and replacing the
 * recovery code; setting up the first code needs no grant, because the vault
 * has no recovery to protect yet.
 *
 * Revoking consent is deliberately absent: withdrawing consent must be as easy
 * as giving it (GDPR Article 7(3)).
 */
export const STEP_UP_ACTIONS = [
  'export_vault',
  'change_password',
  'add_recovery_factor',
  'remove_recovery_factor',
  'delete_account',
  'revoke_session',
] as const

export type StepUpAction = (typeof STEP_UP_ACTIONS)[number]

export const stepUpActionSchema = z.enum(STEP_UP_ACTIONS)

/**
 * Ask for a single-use grant for one action. The proof is the access token of
 * a password sign-in made moments ago, never the password itself.
 */
export const requestStepUpSchema = z.object({
  action: stepUpActionSchema,
  proof: z.string().min(1),
})

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
  stepUpToken: z.string().min(1),
})
