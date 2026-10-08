import { z } from 'zod'

/**
 * The wrapped key and salt are produced on the device. Both must be non-empty:
 * writing a factor without them would record a recovery path that cannot open
 * anything.
 */
export const addRecoveryFactorSchema = z.object({
  type: z.enum(['recovery_code', 'recovery_kit']),
  label: z.string().trim().min(1).max(80),
  wrappedMasterKey: z.string().min(1, 'Wrapped master key is required'),
  salt: z.string().min(1, 'Salt is required'),
  /** A step-up grant for add_recovery_factor. Needed for a kit, and to replace a recovery code. */
  stepUpToken: z.string().min(1).optional(),
})

export const recoveryFactorIdSchema = z.object({ factorId: z.string().uuid() })

/** Removing a factor needs a step-up grant for remove_recovery_factor. */
export const removeRecoveryFactorSchema = z.object({
  factorId: z.string().uuid(),
  stepUpToken: z.string().min(1, 'Confirm your password to continue'),
})

export type AddRecoveryFactorInput = z.infer<typeof addRecoveryFactorSchema>
