import * as userRepo from '@/lib/repositories/user.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { createServiceClient } from '@/lib/supabase/service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'
import { flushOwedBalance } from '@/lib/services/payout.service'
import { eraseUser, type DeletionOutcome } from '@/lib/services/deletion.service'
import { consumeStepUp } from '@/lib/services/session-security.service'
import { UserFacingError } from '@/lib/actions/action-result'
import { DELETE_CONFIRM_PHRASE } from '@luciddata/core/validations/account'
import { retireRecoveryFactors, storeRecoveryCode } from '@/lib/services/recovery-factor.service'
import { getUserVaultData } from '@/lib/services/vault.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import type { VaultData } from '@/types/database.types'

export interface AccountSecurity {
  key_salt: string | null
  wrapped_master_key: string | null
  recovery_code_salt: string | null
  recovery_codes_generated_at: string | null
  onboarding_completed: boolean
  email_notifications_enabled: boolean
}

/** What the client is handed after erasure: proof, not just a redirect. */
export interface DeletionReceiptSummary {
  receipt: DeletionOutcome['receipt']
  signature: string
  keyId: string
  verified: boolean
}

export async function getAccountSecurity(userId: string): Promise<AccountSecurity | null> {
  const user = await userRepo.findUserById(userId)
  if (!user) return null
  return {
    key_salt: user.key_salt,
    wrapped_master_key: user.wrapped_master_key,
    recovery_code_salt: user.recovery_code_salt,
    recovery_codes_generated_at: user.recovery_codes_generated_at,
    onboarding_completed: user.onboarding_completed,
    email_notifications_enabled: user.email_notifications_enabled,
  }
}

// Store the recovery-code escrow (wrapped master key + PBKDF2 salt). The plaintext
// recovery code never reaches the server. The same call records the code as a
// recovery factor, so settings lists the code that recovery will accept.
export async function setRecoveryEscrow(
  userId: string,
  input: { wrapped_master_key: string; recovery_code_salt: string; step_up_token?: string }
): Promise<void> {
  await storeRecoveryCode(
    userId,
    { wrappedMasterKey: input.wrapped_master_key, salt: input.recovery_code_salt },
    input.step_up_token
  )
}

export interface RewrapOutcome {
  /** Recovery kits that stopped working because the master key changed. */
  retiredKits: number
}

/**
 * One entry's data key under the new master key, and the wrapped key it
 * replaces. A type rather than an interface, so it is assignable to Json.
 */
export type RewrapEntry = {
  id: string
  encrypted_dek: string
  dek_salt: string
  previous_encrypted_dek: string
}

// Persist re-wrapped DEK envelopes for every entry, and the connector key, then
// write a single summary audit entry. client_ciphertext is never touched.
export async function rewrapVaultEntries(
  userId: string,
  reason: 'password_change' | 'recovery',
  entries: RewrapEntry[],
  stepUpToken: string,
  ingestKey?: { previous: string; wrapped: string }
): Promise<RewrapOutcome> {
  // LD-106: re-wrapping replaces every entry's key envelope and retires every
  // recovery factor, so a warm session alone is not enough.
  await consumeStepUp(userId, 'change_password', stepUpToken)

  // Every envelope and the connector key move in one transaction, and each
  // replaces only the exact value the device re-wrapped, so an entry edited on
  // another device meanwhile is never overwritten with its old data key. The
  // function is closed to the API roles; the server calls it for the caller.
  const { error } = await createServiceClient().rpc('rewrap_vault_keys', {
    p_user_id: userId,
    p_entries: entries,
    ...(ingestKey ? { p_ingest_key: ingestKey } : {}),
  })
  if (error) {
    // PT409 is the function's compare-and-swap refusal, answered as HTTP 409.
    if (error.code === 'PT409') {
      throw new UserFacingError(
        'Something in your vault changed while it was being re-encrypted. Try again.',
        'conflict'
      )
    }
    throw error
  }

  // The new wrapping is stored. Nothing after this line may throw: a failure
  // reported now would make the browser roll the password back, leaving every
  // entry wrapped under a key that no password derives.
  try {
    const noun = entries.length === 1 ? 'entry' : 'entries'
    await createAuditEntry({
      userId,
      eventType: reason === 'password_change' ? 'password_changed' : 'vault_recovered',
      action:
        reason === 'password_change'
          ? `Changed password and re-encrypted ${entries.length} vault ${noun}`
          : `Recovered vault and re-encrypted ${entries.length} vault ${noun}`,
    })
  } catch (auditError) {
    errorLogger.log(auditError, ErrorSeverity.HIGH, { userId, action: 'REWRAP_AUDIT_FAILED' })
  }
  await notifySecurityEvent(
    userId,
    reason === 'password_change' ? 'password_changed' : 'vault_recovered'
  )

  try {
    const { kits } = await retireRecoveryFactors(userId)
    if (kits > 0) await notifySecurityEvent(userId, 'recovery_kits_retired')
    return { retiredKits: kits }
  } catch (retireError) {
    errorLogger.log(retireError, ErrorSeverity.HIGH, { userId, action: 'RECOVERY_RETIRE_FAILED' })
    return { retiredKits: 0 }
  }
}

/**
 * LD-106: the entries for a full export, once the person has confirmed their
 * password for it. The browser decrypts them. The vault page still shows each
 * entry to whoever holds the unlocked device; this stops a one-click copy of
 * everything.
 */
export async function getEntriesForExport(userId: string, stepUpToken: string): Promise<VaultData[]> {
  await consumeStepUp(userId, 'export_vault', stepUpToken)
  return getUserVaultData(userId)
}

export async function recordDataExport(userId: string, count: number): Promise<void> {
  const noun = count === 1 ? 'entry' : 'entries'
  await createAuditEntry({
    userId,
    eventType: 'data_exported',
    action: `Exported ${count} vault ${noun}`,
  })
}

export async function completeOnboarding(userId: string): Promise<void> {
  await userRepo.updateUser(userId, { onboarding_completed: true })
}

/**
 * Store the salt the browser generated for this account's master key, unless
 * one is already stored, and return the salt that is. Called on the first
 * sign-in after the email address is confirmed, or straight after sign-up where
 * confirmation is off. The caller must derive the key from the returned salt,
 * not from the one it proposed.
 */
export async function claimKeySalt(userId: string, proposed: string): Promise<string> {
  const stored = await userRepo.setKeySaltIfUnset(userId, proposed)
  if (!stored) throw new Error('Key salt was not stored')
  if (stored === proposed) {
    await createAuditEntry({
      userId,
      eventType: 'vault_initialized',
      action: 'Set up vault encryption',
    })
  }
  return stored
}

export async function removePasskey(userId: string, passkeyId: string): Promise<void> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('passkeys')
    .delete()
    .eq('id', passkeyId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new UserFacingError('Passkey not found')

  await createAuditEntry({
    userId,
    eventType: 'passkey_removed',
    action: 'Removed a registered passkey',
    metadata: { passkey_id: passkeyId },
  })
}

// Toggle the optional email copy of in-app notifications. In-app notifications are
// unaffected; this only gates the best-effort email send.
export async function setEmailNotificationPreference(
  userId: string,
  enabled: boolean
): Promise<void> {
  await userRepo.updateUser(userId, { email_notifications_enabled: enabled })
  await createAuditEntry({
    userId,
    eventType: 'notification_preferences_updated',
    action: enabled ? 'Enabled email notifications' : 'Disabled email notifications',
  })
}

/**
 * Erase the account and hand back signed evidence.
 *
 * LD-607: cascades alone left credentials and contributed payloads behind, so
 * the work happens in deletion.service.ts, which removes what does not cascade,
 * verifies the result, and signs a receipt.
 */
export async function deleteAccount(userId: string): Promise<DeletionOutcome> {
  // LD-505: a balance is owed on demand and must never expire, so pay out
  // anything outstanding before the account goes away. Best-effort: a payment
  // provider outage must not block the person's right to delete.
  await flushOwedBalance(userId).catch(() => undefined)

  // Read the email while the row still exists: it keys the invitations that do
  // not cascade, and it is hashed into the receipt.
  const user = await userRepo.findUserById(userId)
  if (!user) throw new UserFacingError('Account not found')

  return eraseUser(userId, user.email)
}

/**
 * Delete an account the way a person asks to: the confirmation phrase typed
 * out, and a single-use step-up grant proving the password was entered just
 * now. A warm session alone is never enough (LD-106).
 */
export async function deleteAccountConfirmed(
  userId: string,
  confirmPhrase: string,
  stepUpToken: string
): Promise<DeletionReceiptSummary> {
  if (confirmPhrase !== DELETE_CONFIRM_PHRASE) {
    throw new UserFacingError('Confirmation phrase does not match')
  }
  await consumeStepUp(userId, 'delete_account', stepUpToken)
  const outcome = await deleteAccount(userId)
  // LD-607: hand back the signed proof so the person can keep and check it.
  return {
    receipt: outcome.receipt,
    signature: outcome.signature,
    keyId: outcome.keyId,
    verified: outcome.verified,
  }
}
