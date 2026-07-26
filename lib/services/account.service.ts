import * as userRepo from '@/lib/repositories/user.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { createServiceClient } from '@/lib/supabase/service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'
import { flushOwedBalance } from '@/lib/services/payout.service'
import { createClient } from '@/lib/supabase/server'

export interface AccountSecurity {
  key_salt: string | null
  wrapped_master_key: string | null
  recovery_code_salt: string | null
  recovery_codes_generated_at: string | null
  onboarding_completed: boolean
  email_notifications_enabled: boolean
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
// recovery code never reaches the server.
export async function setRecoveryEscrow(
  userId: string,
  input: { wrapped_master_key: string; recovery_code_salt: string }
): Promise<void> {
  await userRepo.updateUser(userId, {
    wrapped_master_key: input.wrapped_master_key,
    recovery_code_salt: input.recovery_code_salt,
    recovery_codes_generated_at: new Date().toISOString(),
  })
  await createAuditEntry({
    userId,
    eventType: 'recovery_codes_generated',
    action: 'Generated a vault recovery code',
  })
  await notifySecurityEvent(userId, 'recovery_code_generated')
}

// Persist re-wrapped DEK envelopes for every entry, then write a single summary
// audit entry. client_ciphertext is never touched.
export async function rewrapVaultEntries(
  userId: string,
  reason: 'password_change' | 'recovery',
  entries: { id: string; encrypted_dek: string; dek_salt: string }[]
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('rewrap_vault_entries_atomic', { entries })
  if (error) throw error
  const noun = entries.length === 1 ? 'entry' : 'entries'
  const action =
    reason === 'password_change'
      ? `Changed password and re-encrypted ${entries.length} vault ${noun}`
      : `Recovered vault and re-encrypted ${entries.length} vault ${noun}`
  await createAuditEntry({
    userId,
    eventType: reason === 'password_change' ? 'password_changed' : 'vault_recovered',
    action,
  })
  await notifySecurityEvent(
    userId,
    reason === 'password_change' ? 'password_changed' : 'vault_recovered'
  )
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
  if (!data) throw new Error('Passkey not found')

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

// Hard-delete the auth user; all user-owned tables cascade via foreign keys.
export async function deleteAccount(userId: string): Promise<void> {
  // LD-505: a balance is owed on demand and must never expire, so pay out
  // anything outstanding before the account goes away. Best-effort: a payment
  // provider outage must not block the person's right to delete.
  await flushOwedBalance(userId).catch(() => undefined)

  await createAuditEntry({
    userId,
    eventType: 'account_deleted',
    action: 'Account and all associated data deleted by the user',
  })
  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) throw error
}
