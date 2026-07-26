import { createClient } from '@/lib/supabase/server'
import * as userRepo from '@/lib/repositories/user.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'

/**
 * LD-105 recovery hardening.
 *
 * A recovery factor is an independently wrapped copy of the master key. The
 * server stores wrapped bytes and a salt; the secret that unwraps them exists
 * only where the user put it. Nothing here can produce a usable key.
 *
 * Reads and writes run through the session client so RLS scopes them to the
 * owner. That is deliberate: a service-role path would be a way to enumerate
 * whose vaults are unrecoverable.
 */

export type RecoveryFactorType = 'recovery_code' | 'recovery_kit'

export interface RecoveryFactorSummary {
  id: string
  type: RecoveryFactorType
  label: string
  createdAt: string
  lastConfirmedAt: string | null
}

export interface RecoveryStatus {
  factors: RecoveryFactorSummary[]
  declinedAt: string | null
  lastConfirmedAt: string | null
  /** True when the user may write vault data without setting anything up. */
  vaultWriteAllowed: boolean
  /** True when it is time to ask the user to confirm they still hold a factor. */
  confirmationDue: boolean
}

/** How long between prompts asking the user to confirm they still hold a factor. */
export const CONFIRMATION_INTERVAL_DAYS = 180

export interface AddRecoveryFactorInput {
  type: RecoveryFactorType
  label: string
  wrappedMasterKey: string
  salt: string
}

export async function listRecoveryFactors(): Promise<RecoveryFactorSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recovery_factors')
    .select('id, type, label, created_at, last_confirmed_at')
    .order('created_at', { ascending: true })
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type as RecoveryFactorType,
    label: row.label,
    createdAt: row.created_at,
    lastConfirmedAt: row.last_confirmed_at,
  }))
}

function confirmationOverdue(reference: string | null): boolean {
  if (!reference) return true
  const dueAfter = CONFIRMATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  return Date.now() - new Date(reference).getTime() > dueAfter
}

/** Whether the user currently holds any vault entries. */
async function hasExistingVaultData(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('vault_data')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw error
  return (count ?? 0) > 0
}

export async function getRecoveryStatus(userId: string): Promise<RecoveryStatus> {
  const [factors, user, hasData] = await Promise.all([
    listRecoveryFactors(),
    userRepo.findUserById(userId),
    hasExistingVaultData(userId),
  ])

  const declinedAt = user?.recovery_setup_declined_at ?? null
  const lastConfirmedAt = user?.recovery_last_confirmed_at ?? null

  return {
    factors,
    declinedAt,
    lastConfirmedAt,
    // Existing vaults are never blocked: retroactively locking writes would
    // punish exactly the people this is meant to protect.
    vaultWriteAllowed: factors.length > 0 || Boolean(declinedAt) || hasData,
    confirmationDue: factors.length > 0 && confirmationOverdue(lastConfirmedAt),
  }
}

/**
 * Refuse the first vault write until the user has confirmed a recovery factor or
 * explicitly accepted that their data will be unrecoverable.
 */
export async function assertRecoveryReadyForFirstWrite(userId: string): Promise<void> {
  const status = await getRecoveryStatus(userId)
  if (status.vaultWriteAllowed) return
  throw new Error(
    'Set up a recovery factor before storing data. Without one, forgetting your password makes your vault permanently unreadable, and nobody can restore it for you.'
  )
}

export async function addRecoveryFactor(
  userId: string,
  input: AddRecoveryFactorInput
): Promise<RecoveryFactorSummary> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // One recovery code at a time: a new one replaces the old.
  if (input.type === 'recovery_code') {
    const { error: clearError } = await supabase
      .from('recovery_factors')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'recovery_code')
    if (clearError) throw clearError
  }

  const { data, error } = await supabase
    .from('recovery_factors')
    .insert({
      user_id: userId,
      type: input.type,
      label: input.label,
      wrapped_master_key: input.wrappedMasterKey,
      salt: input.salt,
      last_confirmed_at: now,
    })
    .select('id, type, label, created_at, last_confirmed_at')
    .single()
  if (error) throw error

  // Adding a factor clears an earlier decline: the user changed their mind.
  await userRepo.updateUser(userId, {
    recovery_setup_declined_at: null,
    recovery_last_confirmed_at: now,
  })

  await createAuditEntry({
    userId,
    eventType: 'recovery_factor_added',
    action:
      input.type === 'recovery_code'
        ? 'Added a vault recovery code'
        : 'Added a vault recovery kit',
    metadata: { factor_id: data.id, type: input.type },
  })
  await notifySecurityEvent(userId, 'recovery_code_generated')

  return {
    id: data.id,
    type: data.type as RecoveryFactorType,
    label: data.label,
    createdAt: data.created_at,
    lastConfirmedAt: data.last_confirmed_at,
  }
}

export async function removeRecoveryFactor(userId: string, factorId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recovery_factors')
    .delete()
    .eq('id', factorId)
    .eq('user_id', userId)
    .select('id, type')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Recovery factor not found')

  await createAuditEntry({
    userId,
    eventType: 'recovery_factor_removed',
    action: 'Removed a vault recovery factor',
    metadata: { factor_id: factorId, type: data.type },
  })
}

/** The user confirms they still hold a working factor. */
export async function confirmRecoveryFactor(userId: string, factorId: string): Promise<void> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('recovery_factors')
    .update({ last_confirmed_at: now })
    .eq('id', factorId)
    .eq('user_id', userId)
  if (error) throw error

  await userRepo.updateUser(userId, { recovery_last_confirmed_at: now })
  await createAuditEntry({
    userId,
    eventType: 'recovery_factor_confirmed',
    action: 'Confirmed a vault recovery factor is still held',
    metadata: { factor_id: factorId },
  })
}

/**
 * The user accepts that their data will be unrecoverable. Recorded explicitly so
 * it is never mistaken for an oversight.
 */
export async function declineRecoverySetup(userId: string): Promise<void> {
  await userRepo.updateUser(userId, {
    recovery_setup_declined_at: new Date().toISOString(),
  })
  await createAuditEntry({
    userId,
    eventType: 'recovery_setup_declined',
    action:
      'Chose to store data with no recovery factor, accepting that a forgotten password makes the vault permanently unreadable',
  })
}
