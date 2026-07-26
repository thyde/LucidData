'use server'

import { createClient } from '@/lib/supabase/server'
import * as account from '@/lib/services/account.service'
import {
  setRecoveryEscrowSchema,
  rewrapEntriesSchema,
  deleteAccountSchema,
  emailNotificationPreferenceSchema,
  DELETE_CONFIRM_PHRASE,
} from '@/lib/validations/account'
import { consumeStepUp } from '@/lib/services/session-security.service'
import { z } from 'zod'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getAccountSecurityAction(): Promise<account.AccountSecurity | null> {
  const userId = await getAuthenticatedUserId()
  return account.getAccountSecurity(userId)
}

export async function setRecoveryEscrowAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const payload = setRecoveryEscrowSchema.parse(input)
  return account.setRecoveryEscrow(userId, payload)
}

export async function rewrapVaultEntriesAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const payload = rewrapEntriesSchema.parse(input)
  return account.rewrapVaultEntries(userId, payload.reason, payload.entries)
}

export async function recordDataExportAction(count: number): Promise<void> {
  const userId = await getAuthenticatedUserId()
  return account.recordDataExport(userId, count)
}

export async function completeOnboardingAction(): Promise<void> {
  const userId = await getAuthenticatedUserId()
  return account.completeOnboarding(userId)
}

export async function setEmailNotificationPreferenceAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const { enabled } = emailNotificationPreferenceSchema.parse(input)
  return account.setEmailNotificationPreference(userId, enabled)
}

export async function removePasskeyAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const { passkeyId } = z.object({ passkeyId: z.string().uuid() }).parse(input)
  return account.removePasskey(userId, passkeyId)
}

export async function deleteAccountAction(
  input: unknown
): Promise<account.DeletionReceiptSummary> {
  const userId = await getAuthenticatedUserId()
  const { confirmPhrase, stepUpToken } = deleteAccountSchema.parse(input)
  if (confirmPhrase !== DELETE_CONFIRM_PHRASE) {
    throw new Error('Confirmation phrase does not match')
  }
  // LD-106: a warm session is not enough to destroy an account.
  await consumeStepUp(userId, 'delete_account', stepUpToken)
  const outcome = await account.deleteAccount(userId)
  // LD-607: hand back the signed proof so the person can keep and check it.
  return {
    receipt: outcome.receipt,
    signature: outcome.signature,
    keyId: outcome.keyId,
    verified: outcome.verified,
  }
}
