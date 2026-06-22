import { createServiceClient } from '@/lib/supabase/service'
import type { MfaBackupCode } from '@/types/database.types'

/** Replace all of a user's backup codes with a fresh set of hashes. */
export async function replaceBackupCodes(userId: string, hashes: string[]): Promise<void> {
  const service = createServiceClient()
  const { error: delErr } = await service.from('mfa_backup_codes').delete().eq('user_id', userId)
  if (delErr) throw delErr
  const { error } = await service
    .from('mfa_backup_codes')
    .insert(hashes.map((code_hash) => ({ user_id: userId, code_hash })))
  if (error) throw error
}

export async function findUnusedByHash(userId: string, hash: string): Promise<MfaBackupCode | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('mfa_backup_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('code_hash', hash)
    .is('used_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function markUsed(id: string): Promise<void> {
  const service = createServiceClient()
  const { error } = await service
    .from('mfa_backup_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function countUnused(userId: string): Promise<number> {
  const service = createServiceClient()
  const { count, error } = await service
    .from('mfa_backup_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null)
  if (error) throw error
  return count ?? 0
}
