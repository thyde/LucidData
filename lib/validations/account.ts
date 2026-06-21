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
})

export const emailNotificationPreferenceSchema = z.object({
  enabled: z.boolean(),
})

export const DELETE_CONFIRM_PHRASE = 'DELETE MY ACCOUNT'

export type SetRecoveryEscrowInput = z.infer<typeof setRecoveryEscrowSchema>
export type RewrapEntriesInput = z.infer<typeof rewrapEntriesSchema>
