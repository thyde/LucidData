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
})

export const recoveryFactorIdSchema = z.object({ factorId: z.string().uuid() })

export type AddRecoveryFactorInput = z.infer<typeof addRecoveryFactorSchema>
