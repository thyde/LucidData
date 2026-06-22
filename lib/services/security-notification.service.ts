// Security and account-activity alerts.
//
// These notify a user about sensitive changes to their own account (two-factor
// changes, backup codes, password and recovery events). Each writes an in-app
// notification and, when email is configured and the user has not opted out, an
// email copy. Delivery is best-effort: a failure here never breaks the security
// operation that triggered it (the audit log is the durable record).
//
// Only metadata appears here. Never include vault contents, keys, passwords, or
// backup/recovery codes.

import { createNotification } from '@/lib/services/notification.service'
import { getUserEmail } from '@/lib/repositories/user.repository'

export type SecurityNotificationEvent =
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'backup_codes_generated'
  | 'backup_code_used'
  | 'password_changed'
  | 'vault_recovered'
  | 'recovery_code_generated'

interface SecurityCopy {
  title: string
  message: string
}

const SECURITY_COPY: Record<SecurityNotificationEvent, SecurityCopy> = {
  two_factor_enabled: {
    title: 'Two-factor authentication turned on',
    message: 'Two-factor authentication was turned on for your account.',
  },
  two_factor_disabled: {
    title: 'Two-factor authentication turned off',
    message:
      'Two-factor authentication was turned off for your account. If this was not you, turn it back on and review your account.',
  },
  backup_codes_generated: {
    title: 'New backup codes generated',
    message:
      'A new set of two-factor backup codes was generated. Your previous codes no longer work.',
  },
  backup_code_used: {
    title: 'A backup code was used',
    message:
      'A backup code was used to turn off two-factor authentication. If this was not you, secure your account and set up two-factor again.',
  },
  password_changed: {
    title: 'Password changed',
    message:
      'Your password was changed and your vault was re-encrypted. If this was not you, reset your password right away.',
  },
  vault_recovered: {
    title: 'Vault recovered',
    message:
      'Your vault was recovered with a recovery code and re-encrypted. If this was not you, reset your password right away.',
  },
  recovery_code_generated: {
    title: 'Recovery code generated',
    message:
      'A new vault recovery code was generated. Your previous recovery code no longer works.',
  },
}

/** The title and message shown for a security event. Pure; safe to unit test. */
export function describeSecurityEvent(event: SecurityNotificationEvent): SecurityCopy {
  return SECURITY_COPY[event]
}

/**
 * Notify a user about a security-sensitive change to their own account. Writes an
 * in-app notification (and a best-effort email) deep-linked to settings. Never
 * throws: a notification failure must not fail the security operation.
 */
export async function notifySecurityEvent(
  userId: string,
  event: SecurityNotificationEvent
): Promise<void> {
  try {
    const { title, message } = SECURITY_COPY[event]
    const email = await getUserEmail(userId).catch(() => null)
    await createNotification({
      userId,
      type: 'security_alert',
      title,
      message,
      relatedEntityType: 'security',
      email,
    })
  } catch {
    // Best-effort: the audit log already recorded the event durably.
  }
}
