'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  addRecoveryFactor,
  confirmRecoveryFactor,
  declineRecoverySetup,
  getRecoveryStatus,
  removeRecoveryFactor,
  type RecoveryFactorSummary,
  type RecoveryStatus,
} from '@/lib/services/recovery-factor.service'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/**
 * The wrapped key and salt are produced in the browser. Both must be non-empty:
 * writing a factor without them would record a recovery path that cannot open
 * anything.
 */
const addRecoveryFactorSchema = z.object({
  type: z.enum(['recovery_code', 'recovery_kit']),
  label: z.string().trim().min(1).max(80),
  wrappedMasterKey: z.string().min(1, 'Wrapped master key is required'),
  salt: z.string().min(1, 'Salt is required'),
})

const factorIdSchema = z.object({ factorId: z.string().uuid() })

export async function getRecoveryStatusAction(): Promise<RecoveryStatus | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getRecoveryStatus(userId)  })
}

export async function addRecoveryFactorAction(
  input: unknown
): Promise<RecoveryFactorSummary | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return addRecoveryFactor(userId, addRecoveryFactorSchema.parse(input))  })
}

export async function removeRecoveryFactorAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { factorId } = factorIdSchema.parse(input)
    await removeRecoveryFactor(userId, factorId)  })
}

export async function confirmRecoveryFactorAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { factorId } = factorIdSchema.parse(input)
    await confirmRecoveryFactor(userId, factorId)  })
}

export async function declineRecoverySetupAction(): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await declineRecoverySetup(userId)  })
}
