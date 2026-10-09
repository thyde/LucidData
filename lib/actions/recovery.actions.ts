'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  addPasskeyUnlock,
  addRecoveryFactor,
  confirmRecoveryFactor,
  declineRecoverySetup,
  getPasskeyUnlockMaterial,
  getRecoveryMaterial,
  getRecoveryStatus,
  removeRecoveryFactor,
  retirePasskeyUnlocks,
  type PasskeyUnlockMaterial,
  type RecoveryFactorSummary,
  type RecoveryMaterial,
  type RecoveryStatus,
} from '@/lib/services/recovery-factor.service'
import {
  addPasskeyUnlockSchema,
  addRecoveryFactorSchema,
  recoveryFactorIdSchema as factorIdSchema,
  removeRecoveryFactorSchema,
  retirePasskeyUnlocksSchema,
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

/** LD-112: let one of the person's passkeys open the vault. */
export async function addPasskeyUnlockAction(input: unknown): Promise<RecoveryFactorSummary | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return addPasskeyUnlock(userId, addPasskeyUnlockSchema.parse(input))
  })
}

/** LD-112: the wrapped copies of the master key that the person's passkeys open. */
export async function getPasskeyUnlockMaterialAction(): Promise<PasskeyUnlockMaterial | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getPasskeyUnlockMaterial(userId)
  })
}

/** LD-112: stop the person's passkeys opening the vault, after a reset that did not restore it. */
export async function retirePasskeyUnlocksAction(input: unknown): Promise<{ retired: number } | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { stepUpToken } = retirePasskeyUnlocksSchema.parse(input)
    return retirePasskeyUnlocks(userId, stepUpToken)
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
