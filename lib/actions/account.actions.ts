'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import * as account from '@/lib/services/account.service'
import {
  setRecoveryEscrowSchema,
  beginRewrapSchema,
  stageRewrapSchema,
  applyRewrapSchema,
  exportVaultSchema,
  deleteAccountSchema,
  emailNotificationPreferenceSchema,
  claimKeySaltSchema,
} from '@luciddata/core/validations/account'
import { z } from 'zod'
import type { VaultData } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getAccountSecurityAction(): Promise<account.AccountSecurity | null | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.getAccountSecurity(userId)
  })
}

export async function setRecoveryEscrowAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const payload = setRecoveryEscrowSchema.parse(input)
    return account.setRecoveryEscrow(userId, payload)
  })
}

/** Each entry's wrapped data key, for a re-wrap. Smaller than reading every entry whole. */
export async function getVaultKeyEnvelopesAction(): Promise<
  { id: string; encrypted_dek: string; dek_salt: string }[] | ActionFailure
> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.getVaultKeyEnvelopes(userId)
  })
}

/**
 * LD-210: a password change or a recovery sends its re-wrapped envelopes in
 * parts. Starting consumes the step-up grant; the parts and the apply name the
 * re-wrap it started, which only its owner can use.
 */
export async function beginVaultRewrapAction(input: unknown): Promise<{ rewrapId: string } | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { reason, stepUpToken } = beginRewrapSchema.parse(input)
    return account.beginVaultRewrap(userId, reason, stepUpToken)
  })
}

export async function stageVaultRewrapAction(input: unknown): Promise<{ staged: number } | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { rewrapId, entries } = stageRewrapSchema.parse(input)
    return account.stageVaultRewrap(userId, rewrapId, entries)
  })
}

export async function applyVaultRewrapAction(
  input: unknown
): Promise<(account.RewrapOutcome & { rewrapped: number }) | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { rewrapId, ingestKey } = applyRewrapSchema.parse(input)
    return account.applyVaultRewrap(userId, rewrapId, ingestKey)
  })
}

/** LD-106: every entry for a full export, after the person confirmed their password for it. */
export async function getVaultExportEntriesAction(
  input: unknown
): Promise<VaultData[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { stepUpToken } = exportVaultSchema.parse(input)
    return account.getEntriesForExport(userId, stepUpToken)
  })
}

export async function recordDataExportAction(count: number): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.recordDataExport(userId, count)
  })
}

export async function completeOnboardingAction(): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return account.completeOnboarding(userId)
  })
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
    return account.setEmailNotificationPreference(userId, enabled)
  })
}

export async function removePasskeyAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { passkeyId } = z.object({ passkeyId: z.string().uuid() }).parse(input)
    return account.removePasskey(userId, passkeyId)
  })
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
