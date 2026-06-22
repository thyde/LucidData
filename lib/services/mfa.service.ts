import crypto from 'node:crypto'
import * as mfaRepo from '@/lib/repositories/mfa.repository'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'

const BACKUP_CODE_COUNT = 10

function formatCode(hex: string): string {
  return hex.match(/.{1,4}/g)!.join('-')
}

/** Normalize so display formatting (dashes/case/spaces) does not affect matching. */
function normalize(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(normalize(code)).digest('hex')
}

/** Generate a fresh set of one-time backup codes, replacing any existing ones. */
export async function generateBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    formatCode(crypto.randomBytes(8).toString('hex'))
  )
  await mfaRepo.replaceBackupCodes(userId, codes.map(hashCode))
  await createAuditEntry({
    userId,
    eventType: 'mfa_backup_codes_generated',
    action: 'Generated two-factor backup codes',
    metadata: { count: codes.length },
  })
  return codes
}

/**
 * Redeem a backup code: if valid and unused, mark it used and remove the user's
 * TOTP factor so they can sign in and re-enroll. Returns false if the code is bad.
 */
export async function redeemBackupCode(userId: string, code: string): Promise<boolean> {
  const row = await mfaRepo.findUnusedByHash(userId, hashCode(code))
  if (!row) return false
  await mfaRepo.markUsed(row.id)

  const service = createServiceClient()
  const { data } = await service.auth.admin.mfa.listFactors({ userId })
  for (const factor of data?.factors ?? []) {
    if (factor.factor_type === 'totp') {
      await service.auth.admin.mfa.deleteFactor({ id: factor.id, userId })
    }
  }
  await createAuditEntry({
    userId,
    eventType: 'mfa_recovered',
    action: 'Used a backup code to disable two-factor authentication',
    metadata: {},
  })
  await notifySecurityEvent(userId, 'backup_code_used')
  return true
}

export async function countRemainingBackupCodes(userId: string): Promise<number> {
  return mfaRepo.countUnused(userId)
}
