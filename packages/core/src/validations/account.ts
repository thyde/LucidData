import { z } from 'zod'

export const setRecoveryEscrowSchema = z.object({
  wrapped_master_key: z.string().min(1),
  recovery_code_salt: z.string().min(1),
  step_up_token: z
    .string()
    .min(1)
    .describe('A step-up grant for add_recovery_factor. Needed to replace an existing recovery code.')
    .optional(),
})

/**
 * The most re-wrapped envelopes one request carries. An envelope is about 300
 * bytes, so a part stays near 1.5 MB, under the 4 MB server action limit and
 * Vercel's 4.5 MB request limit.
 */
export const REWRAP_PART_SIZE = 5000

/** One entry's data key under the new master key, and the wrapped key it replaces. */
export const rewrapEnvelopeSchema = z.object({
  id: z.string().uuid(),
  encrypted_dek: z.string().min(1).max(4000),
  dek_salt: z.string().min(1).max(200),
  /** The wrapped key this replaces, so the server can refuse one edited meanwhile. */
  previous_encrypted_dek: z.string().min(1).max(4000),
})

/** Each entry once: the server stores a part in one statement. */
const distinctEntries = (entries: { id: string }[]) => new Set(entries.map((entry) => entry.id)).size === entries.length

/**
 * The connector ingestion key as the device read it, null when there was none,
 * and its new wrap, null to leave it. The server refuses the re-wrap if the
 * stored key is no longer the one read.
 */
export const ingestKeyMoveSchema = z
  .object({
    previous: z.string().min(1).max(8000).nullable(),
    wrapped: z.string().min(1).max(8000).nullable(),
  })
  .refine((key) => key.wrapped === null || key.previous !== null, 'A new wrap needs the wrap it replaces')

/**
 * LD-210: a password change or a recovery re-wraps every entry's data key and
 * sends them in parts, because a large vault's envelopes do not fit in one
 * request. Starting one consumes a step-up grant for change_password.
 */
export const beginRewrapSchema = z.object({
  reason: z.enum(['password_change', 'recovery']),
  /** A step-up grant for change_password, from a password sign-in made moments ago. */
  stepUpToken: z.string().min(1, 'Confirm your password to continue'),
})

export const stageRewrapSchema = z.object({
  rewrapId: z.string().uuid(),
  entries: z
    .array(rewrapEnvelopeSchema)
    .min(1)
    .max(REWRAP_PART_SIZE)
    .refine(distinctEntries, 'Each entry can be sent once'),
})

export const applyRewrapSchema = z.object({
  rewrapId: z.string().uuid(),
  ingestKey: ingestKeyMoveSchema.optional(),
})

/** A full export needs a step-up grant for export_vault. */
export const exportVaultSchema = z.object({
  stepUpToken: z.string().min(1, 'Confirm your password to continue'),
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
export type RewrapEnvelopeInput = z.infer<typeof rewrapEnvelopeSchema>
