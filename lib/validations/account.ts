import { z } from 'zod'

export const setRecoveryEscrowSchema = z.object({
  wrapped_master_key: z.string().min(1),
  recovery_code_salt: z.string().min(1),
})

export const rewrapEntriesSchema = z.object({
  reason: z.enum(['password_change', 'recovery']),
  entries: z.array(
    z.object({
      id: z.string().uuid(),
      encrypted_dek: z.string().min(1),
      dek_salt: z.string().min(1),
    })
  ),
})

export const deleteAccountSchema = z.object({
  confirmPhrase: z.string(),
  // LD-106: a single-use grant proving the password was re-entered just now.
  stepUpToken: z.string().min(1, 'Confirm your password to continue'),
})

export const emailNotificationPreferenceSchema = z.object({
  enabled: z.boolean(),
})

/** A 32-byte key salt from `generateKeySalt`, base64 with padding. */
export const claimKeySaltSchema = z.object({
  keySalt: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'Invalid key salt'),
})

/**
 * The token types a confirmation link may carry. Recovery and magic-link
 * tokens sign someone in, so the confirm page must never accept them.
 */
export const EMAIL_CONFIRMATION_TYPES = ['email', 'signup'] as const
export type EmailConfirmationType = (typeof EMAIL_CONFIRMATION_TYPES)[number]

/** The two values a confirmation link carries. Anything else is refused. */
export const confirmEmailSchema = z.object({
  tokenHash: z.string().min(1).max(512),
  type: z.enum(EMAIL_CONFIRMATION_TYPES),
})

export const DELETE_CONFIRM_PHRASE = 'DELETE MY ACCOUNT'

export type SetRecoveryEscrowInput = z.infer<typeof setRecoveryEscrowSchema>
export type RewrapEntriesInput = z.infer<typeof rewrapEntriesSchema>
