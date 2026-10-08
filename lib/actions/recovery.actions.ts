'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  addRecoveryFactor,
  confirmRecoveryFactor,
  declineRecoverySetup,
  getRecoveryMaterial,
  getRecoveryStatus,
  removeRecoveryFactor,
  type RecoveryFactorSummary,
  type RecoveryMaterial,
  type RecoveryStatus,
} from '@/lib/services/recovery-factor.service'
import {
  addRecoveryFactorSchema,
  recoveryFactorIdSchema as factorIdSchema,
  removeRecoveryFactorSchema,
} from '@luciddata/core/validations/recovery'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getRecoveryStatusAction(): Promise<RecoveryStatus | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getRecoveryStatus(userId)
  })
}

export async function addRecoveryFactorAction(
  input: unknown
): Promise<RecoveryFactorSummary | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return addRecoveryFactor(userId, addRecoveryFactorSchema.parse(input))
  })
}

export async function removeRecoveryFactorAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { factorId, stepUpToken } = removeRecoveryFactorSchema.parse(input)
    await removeRecoveryFactor(userId, factorId, stepUpToken)
  })
}

/** The wrapped copies of the master key, for opening the vault with a recovery code or kit. */
export async function getRecoveryMaterialAction(): Promise<RecoveryMaterial | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getRecoveryMaterial(userId)
  })
}

export async function confirmRecoveryFactorAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { factorId } = factorIdSchema.parse(input)
    await confirmRecoveryFactor(userId, factorId)
  })
}

export async function declineRecoverySetupAction(): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await declineRecoverySetup(userId)
  })
}
