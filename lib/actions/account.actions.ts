'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import * as account from '@/lib/services/account.service'
import {
  setRecoveryEscrowSchema,
  rewrapEntriesSchema,
  deleteAccountSchema,
  emailNotificationPreferenceSchema,
  claimKeySaltSchema,
} from '@luciddata/core/validations/account'
import { z } from 'zod'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getAccountSecurityAction(): Promise<account.AccountSecurity | null | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.getAccountSecurity(userId)  })
}

export async function setRecoveryEscrowAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const payload = setRecoveryEscrowSchema.parse(input)
    return account.setRecoveryEscrow(userId, payload)  })
}

export async function rewrapVaultEntriesAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const payload = rewrapEntriesSchema.parse(input)
    return account.rewrapVaultEntries(userId, payload.reason, payload.entries)  })
}

export async function recordDataExportAction(count: number): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.recordDataExport(userId, count)  })
}

export async function completeOnboardingAction(): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.completeOnboarding(userId)  })
}

/**
 * LD-610: record the salt for a new vault, once. Returns the stored salt, which
 * differs from the one sent only if another tab claimed first.
 */
export async function claimKeySaltAction(input: unknown): Promise<string | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { keySalt } = claimKeySaltSchema.parse(input)
    return account.claimKeySalt(userId, keySalt)
  })
}

export async function setEmailNotificationPreferenceAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { enabled } = emailNotificationPreferenceSchema.parse(input)
    return account.setEmailNotificationPreference(userId, enabled)  })
}

export async function removePasskeyAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { passkeyId } = z.object({ passkeyId: z.string().uuid() }).parse(input)
    return account.removePasskey(userId, passkeyId)  })
}

export async function deleteAccountAction(
  input: unknown
): Promise<account.DeletionReceiptSummary | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { confirmPhrase, stepUpToken } = deleteAccountSchema.parse(input)
    return account.deleteAccountConfirmed(userId, confirmPhrase, stepUpToken)
  })
}
