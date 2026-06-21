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

export async function deleteAccountAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const { confirmPhrase } = deleteAccountSchema.parse(input)
  if (confirmPhrase !== DELETE_CONFIRM_PHRASE) {
    throw new Error('Confirmation phrase does not match')
  }
  return account.deleteAccount(userId)
}
