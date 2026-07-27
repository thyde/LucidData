// Browser-side orchestration for recovery codes, password change, and vault recovery.
// Pure crypto runs in the browser; persistence goes through server actions.

import { deriveMasterKey, deriveMasterKeyExtractable, importMasterKey } from '@/lib/crypto/key-derivation'
import { rewrapDek } from '@/lib/crypto/client-crypto'
import {
  generateRecoveryCode,
  generateRecoverySalt,
  generateRecoveryKitSecret,
  deriveRecoveryKey,
  wrapMasterKeyForRecovery,
  unwrapMasterKeyForRecovery,
} from '@/lib/crypto/recovery'
import { getVaultEntriesAction } from '@/lib/actions/vault.actions'
import { setRecoveryEscrowAction, rewrapVaultEntriesAction } from '@/lib/actions/account.actions'
import { addRecoveryFactorAction } from '@/lib/actions/recovery.actions'
import { unwrap } from '@/lib/actions/unwrap'

// Generate a fresh recovery code, escrow the (extractable) master key under it,
// persist the wrapped bytes + salt, and return the code to show the user once.
export async function escrowMasterKeyWithNewCode(extractableMasterKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', extractableMasterKey)
  const code = generateRecoveryCode()
  const salt = generateRecoverySalt()
  const recoveryKey = await deriveRecoveryKey(code, salt)
  const wrapped = await wrapMasterKeyForRecovery(raw, recoveryKey)
  // The legacy escrow columns still back the password-reset recovery flow.
  await unwrap(setRecoveryEscrowAction({ wrapped_master_key: wrapped, recovery_code_salt: salt }))
  // LD-105: also record it as a managed factor so the user can see and confirm
  // it. Best-effort: the escrow above is already durable, and failing here would
  // throw away the code before it was ever shown to the user.
  await unwrap(addRecoveryFactorAction({
    type: 'recovery_code',
    label: 'Recovery code',
    wrappedMasterKey: wrapped,
    salt,
  })).catch(() => undefined)
  return code
}

// Derive an extractable master key from the password and escrow it under a new code.
export async function setupRecoveryFromPassword(password: string, keySalt: string): Promise<string> {
  const extractable = await deriveMasterKeyExtractable(password, keySalt)
  return escrowMasterKeyWithNewCode(extractable)
}

/**
 * LD-105: create a second, independent recovery factor.
 *
 * The kit secret is generated in the browser, wraps the master key through the
 * same PBKDF2 and AES-GCM path as the printed code, and is returned once for the
 * user to download. Only the wrapped bytes and the salt reach the server.
 */
export async function createRecoveryKitFromPassword(
  password: string,
  keySalt: string,
  label: string
): Promise<string> {
  const extractable = await deriveMasterKeyExtractable(password, keySalt)
  const raw = await crypto.subtle.exportKey('raw', extractable)
  const secret = generateRecoveryKitSecret()
  const salt = generateRecoverySalt()
  const kitKey = await deriveRecoveryKey(secret, salt)
  const wrapped = await wrapMasterKeyForRecovery(raw, kitKey)
  await unwrap(addRecoveryFactorAction({
    type: 'recovery_kit',
    label,
    wrappedMasterKey: wrapped,
    salt,
  }))
  return secret
}

// Re-wrap every vault entry's DEK from oldMasterKey to newMasterKey and persist.
export async function rewrapAllEntries(
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey,
  reason: 'password_change' | 'recovery'
): Promise<number> {
  const entries = await unwrap(getVaultEntriesAction())
  const rewrapped = await Promise.all(
    entries.map(async (entry) => {
      const fields = await rewrapDek(oldMasterKey, newMasterKey, entry.encrypted_dek, entry.dek_salt)
      return { id: entry.id, ...fields }
    })
  )
  await unwrap(rewrapVaultEntriesAction({ reason, entries: rewrapped }))
  return rewrapped.length
}

// Recover the old (pre-reset) master key from a recovery code + escrow blob.
export async function recoverOldMasterKey(code: string, wrappedB64: string, saltB64: string): Promise<CryptoKey> {
  const recoveryKey = await deriveRecoveryKey(code, saltB64)
  const raw = await unwrapMasterKeyForRecovery(wrappedB64, recoveryKey)
  return importMasterKey(raw)
}

export { deriveMasterKey }
