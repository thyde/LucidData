'use server'

import { createClient } from '@/lib/supabase/server'
import {
  generateBackupCodes,
  redeemBackupCode,
  countRemainingBackupCodes,
} from '@/lib/services/mfa.service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'

async function getAuthedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/**
 * Finish TOTP enrollment after the client has verified the first code: issue the
 * initial backup codes and record that two-factor was turned on. Returns the
 * one-time backup codes to display.
 */
export async function completeTwoFactorEnrollmentAction(): Promise<{ codes: string[] }> {
  const userId = await getAuthedUserId()
  const codes = await generateBackupCodes(userId)
  await createAuditEntry({
    userId,
    eventType: 'two_factor_enabled',
    action: 'Enabled two-factor authentication',
  })
  await notifySecurityEvent(userId, 'two_factor_enabled')
  return { codes }
}

/** Regenerate the signed-in user's two-factor backup codes, replacing the old set. */
export async function generateBackupCodesAction(): Promise<{ codes: string[] }> {
  const userId = await getAuthedUserId()
  const codes = await generateBackupCodes(userId)
  await notifySecurityEvent(userId, 'backup_codes_generated')
  return { codes }
}

/** Record that the signed-in user turned off two-factor authentication. */
export async function recordTwoFactorDisabledAction(): Promise<void> {
  const userId = await getAuthedUserId()
  await createAuditEntry({
    userId,
    eventType: 'two_factor_disabled',
    action: 'Disabled two-factor authentication',
  })
  await notifySecurityEvent(userId, 'two_factor_disabled')
}

/**
 * Redeem a backup code during the two-factor challenge. On success the user's TOTP
 * factor is removed, so the caller should refresh the session and continue.
 */
export async function redeemBackupCodeAction(code: string): Promise<{ ok: boolean }> {
  const userId = await getAuthedUserId()
  return { ok: await redeemBackupCode(userId, code) }
}

export async function getBackupCodesStatusAction(): Promise<{ remaining: number }> {
  const userId = await getAuthedUserId()
  return { remaining: await countRemainingBackupCodes(userId) }
}
