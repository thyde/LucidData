'use server'

import { createClient } from '@/lib/supabase/server'
import {
  generateBackupCodes,
  redeemBackupCode,
  countRemainingBackupCodes,
} from '@/lib/services/mfa.service'

async function getAuthedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/** Generate (or regenerate) the signed-in user's two-factor backup codes. */
export async function generateBackupCodesAction(): Promise<{ codes: string[] }> {
  const userId = await getAuthedUserId()
  return { codes: await generateBackupCodes(userId) }
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
