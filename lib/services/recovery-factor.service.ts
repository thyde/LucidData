import { RECOVERY_REQUIRED } from '@luciddata/core/validations/refusals'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import * as userRepo from '@/lib/repositories/user.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { notifySecurityEvent } from '@/lib/services/security-notification.service'
import { consumeStepUp, STEP_UP_REQUIRED } from '@/lib/services/session-security.service'
import { UserFacingError } from '@/lib/actions/action-result'

/**
 * LD-105 recovery hardening.
 *
 * A recovery factor is an independently wrapped copy of the master key. The
 * server stores wrapped bytes and a salt; the secret that unwraps them exists
 * only where the user put it. Nothing here can produce a usable key.
 *
 * Reads run through the session client, so RLS scopes them to the owner and a
 * bug here cannot list anyone else's factors. Writes use the service role,
 * filtered to the caller's id, so that the API roles need no write access to
 * this table or to the escrow columns: a change made straight through PostgREST
 * would skip the audit entry, the notification, and the step-up check below.
 */

export type RecoveryFactorType = 'recovery_code' | 'recovery_kit' | 'passkey_prf'

/**
 * The factors that bring a vault back after a password reset. LD-112's
 * passkey factor opens the vault at sign-in, but a reset cannot use it, so it
 * does not count as recovery being set up.
 */
const RESETTING_TYPES: ReadonlySet<RecoveryFactorType> = new Set(['recovery_code', 'recovery_kit'])

export interface RecoveryFactorSummary {
  id: string
  type: RecoveryFactorType
  label: string
  createdAt: string
  lastConfirmedAt: string | null
  /** For a passkey factor, the passkey it belongs to. */
  passkeyId: string | null
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
  /** A step-up grant for add_recovery_factor. Needed for a kit, and to replace a recovery code. */
  stepUpToken?: string
}

export async function listRecoveryFactors(): Promise<RecoveryFactorSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recovery_factors')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw error

  return (data ?? []).map(toSummary)
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
  const [all, user, hasData] = await Promise.all([
    listRecoveryFactors(),
    userRepo.findUserById(userId),
    hasExistingVaultData(userId),
  ])
  // Passkeys are managed with the passkeys, and cannot reset a password.
  const factors = all.filter((factor) => RESETTING_TYPES.has(factor.type))

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
  throw new UserFacingError(
    'Set up a recovery factor before storing data. Without one, forgetting your password makes your vault permanently unreadable, and nobody can restore it for you.',
    RECOVERY_REQUIRED
  )
}

const SUMMARY_COLUMNS = 'id, type, label, created_at, last_confirmed_at, passkey_id'

function toSummary(row: {
  id: string
  type: string
  label: string
  created_at: string
  last_confirmed_at: string | null
  passkey_id: string | null
}): RecoveryFactorSummary {
  return {
    id: row.id,
    type: row.type as RecoveryFactorType,
    label: row.label,
    createdAt: row.created_at,
    lastConfirmedAt: row.last_confirmed_at,
    passkeyId: row.passkey_id,
  }
}

/** Refuse without a grant for the action, and consume the grant when there is one. */
async function requireStepUp(
  userId: string,
  action: 'add_recovery_factor' | 'remove_recovery_factor',
  stepUpToken: string | undefined
): Promise<void> {
  if (!stepUpToken) {
    throw new UserFacingError('Confirm your password to continue', STEP_UP_REQUIRED)
  }
  await consumeStepUp(userId, action, stepUpToken)
}

/** Whether the account has a recovery code, as escrow or as a factor. */
async function hasRecoveryCode(userId: string): Promise<boolean> {
  const service = createServiceClient()
  const [user, codes] = await Promise.all([
    service.from('users').select('wrapped_master_key').eq('id', userId).maybeSingle(),
    service
      .from('recovery_factors')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'recovery_code'),
  ])
  if (user.error) throw user.error
  if (codes.error) throw codes.error
  return Boolean(user.data?.wrapped_master_key) || (codes.count ?? 0) > 0
}

/** The escrow columns cleared together, so a code that was removed or retired stops working. */
const NO_ESCROW = {
  wrapped_master_key: null,
  recovery_code_salt: null,
  recovery_codes_generated_at: null,
}

/**
 * Store a new recovery code. It lives in two places with the same wrapped
 * bytes: the escrow on the account, which password-reset recovery has always
 * read, and a factor row, which settings lists and asks the person to confirm.
 * There is one code at a time, so the previous one stops working.
 */
export async function storeRecoveryCode(
  userId: string,
  input: { wrappedMasterKey: string; salt: string },
  stepUpToken?: string
): Promise<RecoveryFactorSummary> {
  const service = createServiceClient()
  // LD-106: replacing a code takes away the one the person saved, so it needs a
  // fresh password proof. The first code needs none: there is nothing to replace.
  if (await hasRecoveryCode(userId)) {
    await requireStepUp(userId, 'add_recovery_factor', stepUpToken)
  }
  const now = new Date().toISOString()

  const { error: escrowError } = await service
    .from('users')
    .update({
      wrapped_master_key: input.wrappedMasterKey,
      recovery_code_salt: input.salt,
      recovery_codes_generated_at: now,
      // Setting up a factor clears an earlier decline: the person changed their mind.
      recovery_setup_declined_at: null,
      recovery_last_confirmed_at: now,
      updated_at: now,
    })
    .eq('id', userId)
  if (escrowError) throw escrowError

  const { error: clearError } = await service
    .from('recovery_factors')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'recovery_code')
  if (clearError) throw clearError

  const { data, error } = await service
    .from('recovery_factors')
    .insert({
      user_id: userId,
      type: 'recovery_code',
      label: 'Recovery code',
      wrapped_master_key: input.wrappedMasterKey,
      salt: input.salt,
      last_confirmed_at: now,
    })
    .select(SUMMARY_COLUMNS)
    .single()
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'recovery_codes_generated',
    action: 'Generated a vault recovery code',
    metadata: { factor_id: data.id },
  })
  await notifySecurityEvent(userId, 'recovery_code_generated')
  return toSummary(data)
}

export async function addRecoveryFactor(
  userId: string,
  input: AddRecoveryFactorInput
): Promise<RecoveryFactorSummary> {
  if (input.type === 'recovery_code') return storeRecoveryCode(userId, input, input.stepUpToken)

  // A kit is a new way into the vault, so it needs a fresh password proof.
  await requireStepUp(userId, 'add_recovery_factor', input.stepUpToken)
  const service = createServiceClient()
  const now = new Date().toISOString()
  const { data, error } = await service
    .from('recovery_factors')
    .insert({
      user_id: userId,
      type: input.type,
      label: input.label,
      wrapped_master_key: input.wrappedMasterKey,
      salt: input.salt,
      last_confirmed_at: now,
    })
    .select(SUMMARY_COLUMNS)
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
    action: 'Added a vault recovery kit',
    metadata: { factor_id: data.id, type: input.type },
  })
  await notifySecurityEvent(userId, 'recovery_kit_added')
  return toSummary(data)
}

/**
 * LD-106: removing a way back into the vault needs a fresh password proof, so
 * someone holding an unlocked device or a stolen session cannot quietly take
 * the person's recovery away. Removing the recovery code also clears the escrow
 * that holds the same code, or the code would keep working after it was removed.
 */
export async function removeRecoveryFactor(
  userId: string,
  factorId: string,
  stepUpToken: string
): Promise<void> {
  await requireStepUp(userId, 'remove_recovery_factor', stepUpToken)

  const service = createServiceClient()
  const { data, error } = await service
    .from('recovery_factors')
    .delete()
    .eq('id', factorId)
    .eq('user_id', userId)
    .select('id, type')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new UserFacingError('Recovery factor not found', 'not_found')

  if (data.type === 'recovery_code') {
    const { error: escrowError } = await service
      .from('users')
      .update({ ...NO_ESCROW, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (escrowError) throw escrowError
  }

  await createAuditEntry({
    userId,
    eventType: 'recovery_factor_removed',
    action:
      data.type === 'recovery_code'
        ? 'Removed the vault recovery code'
        : data.type === 'passkey_prf'
          ? 'Turned off opening the vault with a passkey'
          : 'Removed a vault recovery kit',
    metadata: { factor_id: factorId, type: data.type },
  })
  await notifySecurityEvent(userId, data.type === 'passkey_prf' ? 'passkey_unlock_removed' : 'recovery_factor_removed')
}

/** The user confirms they still hold a working factor. */
export async function confirmRecoveryFactor(userId: string, factorId: string): Promise<void> {
  const service = createServiceClient()
  const now = new Date().toISOString()
  const { data, error } = await service
    .from('recovery_factors')
    .update({ last_confirmed_at: now })
    .eq('id', factorId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  // Confirming a factor that is not there must not record recovery as confirmed.
  if (!data) throw new UserFacingError('Recovery factor not found', 'not_found')

  await userRepo.updateUser(userId, { recovery_last_confirmed_at: now })
  await createAuditEntry({
    userId,
    eventType: 'recovery_factor_confirmed',
    action: 'Confirmed a vault recovery factor is still held',
    metadata: { factor_id: factorId },
  })
}

/**
 * A password change or a recovery gives the vault a new master key, and every
 * recovery factor wraps the old one, so each stops working at that moment.
 * They are removed rather than left listed as if they still worked, and the
 * caller makes a new recovery code straight afterwards. Returns how many kits
 * went, so the person can be told to make new ones.
 */
export async function retireRecoveryFactors(userId: string): Promise<{ kits: number; passkeys: number }> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('recovery_factors')
    .delete()
    .eq('user_id', userId)
    .select('id, type')
  if (error) throw error

  const { error: escrowError } = await service
    .from('users')
    .update({ ...NO_ESCROW, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (escrowError) throw escrowError

  const retired = data ?? []
  if (retired.length > 0) {
    await createAuditEntry({
      userId,
      eventType: 'recovery_factor_removed',
      action: `Retired ${retired.length} recovery ${retired.length === 1 ? 'factor' : 'factors'} because the vault key changed`,
      metadata: { reason: 'vault_key_changed', factor_ids: retired.map((factor) => factor.id) },
    })
  }
  return {
    kits: retired.filter((factor) => factor.type === 'recovery_kit').length,
    passkeys: retired.filter((factor) => factor.type === 'passkey_prf').length,
  }
}

/**
 * LD-112: let a passkey open the vault. The browser has wrapped a copy of the
 * master key under a key derived from the passkey's PRF output; the server
 * stores that copy and the PRF input, and never sees the output. A new way
 * into the vault, so it needs a fresh password proof, as a kit does.
 */
export async function addPasskeyUnlock(
  userId: string,
  input: { passkeyId: string; wrappedMasterKey: string; salt: string; stepUpToken: string }
): Promise<RecoveryFactorSummary> {
  await requireStepUp(userId, 'add_recovery_factor', input.stepUpToken)
  const service = createServiceClient()

  const { data: passkey, error: passkeyError } = await service
    .from('passkeys')
    .select('id, device_name')
    .eq('id', input.passkeyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (passkeyError) throw passkeyError
  if (!passkey) throw new UserFacingError('Passkey not found', 'not_found')

  // One way in per passkey: turning it on again replaces the earlier copy.
  const { error: clearError } = await service
    .from('recovery_factors')
    .delete()
    .eq('user_id', userId)
    .eq('passkey_id', passkey.id)
  if (clearError) throw clearError

  const { data, error } = await service
    .from('recovery_factors')
    .insert({
      user_id: userId,
      type: 'passkey_prf',
      label: passkey.device_name ?? 'Passkey',
      wrapped_master_key: input.wrappedMasterKey,
      salt: input.salt,
      passkey_id: passkey.id,
      last_confirmed_at: new Date().toISOString(),
    })
    .select(SUMMARY_COLUMNS)
    .single()
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'recovery_factor_added',
    action: 'Turned on opening the vault with a passkey',
    metadata: { factor_id: data.id, type: 'passkey_prf', passkey_id: passkey.id },
  })
  await notifySecurityEvent(userId, 'passkey_unlock_added')
  return toSummary(data)
}

/** One passkey's wrapped copy of the master key, keyed by the credential id the browser reports. */
export interface PasskeyUnlock {
  credentialId: string
  wrappedMasterKey: string
  salt: string
}

export interface PasskeyUnlockMaterial {
  passkeys: PasskeyUnlock[]
  /**
   * The newest entry's wrapped data key, so a copy is used only if it opens the
   * vault as it is now. Null when the vault is empty.
   */
  probe: { encrypted_dek: string; dek_salt: string } | null
  /** The connector ingestion key, wrapped under the master key: the check when there are no entries. */
  ingest_key: { wrapped: string } | null
}

/** LD-112: whether any of the person's passkeys can open the vault. */
export async function hasPasskeyUnlock(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('recovery_factors')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'passkey_prf')
  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * LD-112: everything a device needs to open the vault with one of the
 * person's passkeys. Only wrapped bytes and salts leave the server, read under
 * the person's own session.
 */
export async function getPasskeyUnlockMaterial(userId: string): Promise<PasskeyUnlockMaterial> {
  const supabase = await createClient()
  const [factors, probe, user] = await Promise.all([
    supabase
      .from('recovery_factors')
      .select('wrapped_master_key, salt, passkeys!inner(credential_id)')
      .eq('user_id', userId)
      .eq('type', 'passkey_prf'),
    supabase
      .from('vault_data')
      .select('encrypted_dek, dek_salt')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    userRepo.findUserById(userId),
  ])
  if (factors.error) throw factors.error
  if (probe.error) throw probe.error

  return {
    passkeys: (factors.data ?? []).map((row) => ({
      credentialId: (row.passkeys as unknown as { credential_id: string }).credential_id,
      wrappedMasterKey: row.wrapped_master_key,
      salt: row.salt,
    })),
    probe: probe.data ?? null,
    ingest_key: user?.wrapped_ingest_private_key ? { wrapped: user.wrapped_ingest_private_key } : null,
  }
}

export interface RecoveryMaterial {
  key_salt: string | null
  /** The recovery-code escrow that password-reset recovery reads. */
  escrow: { wrapped_master_key: string; salt: string } | null
  factors: { id: string; type: RecoveryFactorType; wrapped_master_key: string; salt: string }[]
  /** One entry's wrapped data key, to check a recovered key against the vault. Null when it is empty. */
  probe: { encrypted_dek: string; dek_salt: string } | null
  /**
   * The connector ingestion private key, which LD-201 wraps under the master key
   * itself. It is vault content too: it checks a recovered key when there are no
   * entries, and it must move when the master key does.
   */
  ingest_key: { wrapped: string } | null
}

/**
 * Everything the device needs to open the vault with a recovery code or kit:
 * the wrapped copies of the master key and one entry to test a copy against.
 * Only wrapped bytes leave the server. Each copy is sealed under a secret of
 * at least 125 bits that the server never sees, behind 600,000 rounds of PBKDF2.
 */
export async function getRecoveryMaterial(userId: string): Promise<RecoveryMaterial> {
  const supabase = await createClient()
  const [user, factors, probe] = await Promise.all([
    userRepo.findUserById(userId),
    // Only factors a person can use without their password. A passkey that
    // opens the vault is retired by the reset, so it cannot restore anything.
    supabase
      .from('recovery_factors')
      .select('id, type, wrapped_master_key, salt')
      .eq('user_id', userId)
      .in('type', [...RESETTING_TYPES])
      .order('created_at', { ascending: false }),
    // The oldest entry: if a reset without recovery left newer entries under the
    // new password, the oldest is still under the key a recovery factor opens.
    supabase
      .from('vault_data')
      .select('encrypted_dek, dek_salt')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  if (factors.error) throw factors.error
  if (probe.error) throw probe.error

  return {
    key_salt: user?.key_salt ?? null,
    escrow:
      user?.wrapped_master_key && user.recovery_code_salt
        ? { wrapped_master_key: user.wrapped_master_key, salt: user.recovery_code_salt }
        : null,
    factors: (factors.data ?? []).map((row) => ({
      id: row.id,
      type: row.type as RecoveryFactorType,
      wrapped_master_key: row.wrapped_master_key,
      salt: row.salt,
    })),
    probe: probe.data ?? null,
    ingest_key: user?.wrapped_ingest_private_key ? { wrapped: user.wrapped_ingest_private_key } : null,
  }
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
