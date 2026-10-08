// Browser-side orchestration for recovery codes, password change, and vault recovery.
// Pure crypto runs in the browser; persistence goes through server actions.

import { deriveMasterKey, deriveMasterKeyExtractable, generateKeySalt, importMasterKey } from '@luciddata/core/crypto/key-derivation'
import { decryptWithKey, encryptWithKey, rewrapDek } from '@luciddata/core/crypto/client-crypto'
import {
  generateRecoveryCode,
  generateRecoverySalt,
  generateRecoveryKitSecret,
  deriveRecoveryKey,
  wrapMasterKeyForRecovery,
  findMasterKeyWithRecoverySecret,
  opensDataKey,
  recoverySecretKind,
} from '@luciddata/core/crypto/recovery'
import { getVaultEntriesAction } from '@/lib/actions/vault.actions'
import { setRecoveryEscrowAction, rewrapVaultEntriesAction, claimKeySaltAction } from '@/lib/actions/account.actions'
import { addRecoveryFactorAction } from '@/lib/actions/recovery.actions'
import { getIngestionKeyAction } from '@/lib/actions/connector.actions'
import type { RecoveryMaterial } from '@/lib/services/recovery-factor.service'
import { recordRegistrationChoicesAction } from '@/lib/actions/legal.actions'
import { unwrap } from '@/lib/actions/unwrap'

export interface VaultSetup {
  /** The salt this account's master key comes from. Always the stored one. */
  keySalt: string
  /** Shown to the person once. Null if another tab set up first or escrow failed. */
  recoveryCode: string | null
}

/**
 * LD-610: first-time vault setup, run in the browser with the password the
 * person just signed in with. Happens straight after sign-up where email
 * confirmation is off, and on the first sign-in after confirming where it is on.
 */
export async function setUpVault(password: string): Promise<VaultSetup> {
  const proposed = generateKeySalt()
  const keySalt = await unwrap(claimKeySaltAction({ keySalt: proposed }))
  // LD-110: what the person agreed to on the registration form, recorded now
  // that there is a session to record it with. Not fatal: anything missed is
  // asked for again before the dashboard opens.
  await recordRegistrationChoicesAction().catch(() => undefined)
  // Another tab won the race and has already shown its own recovery code.
  if (keySalt !== proposed) return { keySalt, recoveryCode: null }
  try {
    return { keySalt, recoveryCode: await setupRecoveryFromPassword(password, keySalt) }
  } catch {
    // LD-105: the first vault write is blocked until recovery exists, and
    // settings can create the code later.
    return { keySalt, recoveryCode: null }
  }
}

// Generate a fresh recovery code, escrow the (extractable) master key under it,
// persist the wrapped bytes + salt, and return the code to show the user once.
// Replacing an existing code needs a step-up grant for add_recovery_factor.
export async function escrowMasterKeyWithNewCode(
  extractableMasterKey: CryptoKey,
  stepUpToken?: string
): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', extractableMasterKey)
  const code = generateRecoveryCode()
  const salt = generateRecoverySalt()
  const recoveryKey = await deriveRecoveryKey(code, salt)
  const wrapped = await wrapMasterKeyForRecovery(raw, recoveryKey)
  // One call stores the escrow that password-reset recovery reads and the factor
  // that settings lists, so the two can never disagree about which code works.
  await unwrap(
    setRecoveryEscrowAction({
      wrapped_master_key: wrapped,
      recovery_code_salt: salt,
      ...(stepUpToken ? { step_up_token: stepUpToken } : {}),
    })
  )
  return code
}

// Derive an extractable master key from the password and escrow it under a new code.
export async function setupRecoveryFromPassword(
  password: string,
  keySalt: string,
  stepUpToken?: string
): Promise<string> {
  const extractable = await deriveMasterKeyExtractable(password, keySalt)
  return escrowMasterKeyWithNewCode(extractable, stepUpToken)
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
  label: string,
  stepUpToken: string
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
    stepUpToken,
  }))
  return secret
}

export interface RewrapResult {
  count: number
  /** Recovery kits that stopped working because the master key changed. */
  retiredKits: number
}

/** One entry's data key wrapped under the new master key, ready to store. */
export interface RewrapEnvelope {
  id: string
  encrypted_dek: string
  dek_salt: string
  /** The wrapped key as read, so the server can refuse an entry edited meanwhile. */
  previous_encrypted_dek: string
}

/**
 * Some entries open with neither key. They were saved under a password the
 * person used for a while after an earlier reset without recovery.
 */
export class EntriesUnderAnotherKeyError extends Error {
  constructor(readonly count: number) {
    super(`${count} ${count === 1 ? 'entry is' : 'entries are'} locked with a different password`)
    this.name = 'EntriesUnderAnotherKeyError'
  }
}

/** Everything a key change moves, computed in the browser and not yet sent. */
export interface PreparedRewrap {
  entries: RewrapEnvelope[]
  /** The connector ingestion private key under the new key, when there is one to move. */
  ingestKey: { previous: string; wrapped: string } | null
}

/**
 * Re-wrap every entry's data key from oldMasterKey to newMasterKey in the
 * browser, without sending anything, so a flow can find out whether the whole
 * vault will move before it changes the password. The connector ingestion key
 * moves with the entries.
 *
 * An entry already under the new key comes back unchanged. That happens when
 * someone reset their password without recovering, kept using the vault under
 * the new password, and later recovers the older entries with a code or kit.
 * An entry under neither key throws EntriesUnderAnotherKeyError.
 */
export async function prepareRewrap(
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey
): Promise<PreparedRewrap> {
  const [entries, ingestion] = await Promise.all([
    unwrap(getVaultEntriesAction()),
    unwrap(getIngestionKeyAction()),
  ])
  const rewrapped = await Promise.all(
    entries.map(async (entry): Promise<RewrapEnvelope | null> => {
      try {
        const fields = await rewrapDek(oldMasterKey, newMasterKey, entry.encrypted_dek, entry.dek_salt)
        return { id: entry.id, ...fields, previous_encrypted_dek: entry.encrypted_dek }
      } catch {
        return (await opensDataKey(newMasterKey, entry))
          ? {
              id: entry.id,
              encrypted_dek: entry.encrypted_dek,
              dek_salt: entry.dek_salt,
              previous_encrypted_dek: entry.encrypted_dek,
            }
          : null
      }
    })
  )
  const locked = rewrapped.filter((entry) => entry === null).length
  if (locked > 0) throw new EntriesUnderAnotherKeyError(locked)
  return {
    entries: rewrapped as RewrapEnvelope[],
    ingestKey: await rewrapIngestionKey(oldMasterKey, newMasterKey, ingestion.wrappedPrivateKey),
  }
}

/**
 * LD-201 wraps the connector ingestion private key under the master key itself,
 * so it has to move whenever the master key does. Null when there is nothing to
 * move: no key, a key already under the new master key, or one an earlier
 * password change left under a key that nothing derives any more.
 */
async function rewrapIngestionKey(
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey,
  wrapped: string | null
): Promise<PreparedRewrap['ingestKey']> {
  if (!wrapped) return null
  try {
    const privateKey = await decryptWithKey(oldMasterKey, wrapped)
    return { previous: wrapped, wrapped: await encryptWithKey(newMasterKey, privateKey) }
  } catch {
    return null
  }
}

// Store a prepared re-wrap with a step-up grant for change_password. The server
// then retires every recovery factor, since each one wraps the old key.
export async function storeRewrap(
  prepared: PreparedRewrap,
  reason: 'password_change' | 'recovery',
  stepUpToken: string
): Promise<RewrapResult> {
  const { retiredKits } = await unwrap(
    rewrapVaultEntriesAction({
      reason,
      entries: prepared.entries,
      stepUpToken,
      ...(prepared.ingestKey ? { ingestKey: prepared.ingestKey } : {}),
    })
  )
  return { count: prepared.entries.length, retiredKits }
}

export async function rewrapAllEntries(
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey,
  reason: 'password_change' | 'recovery',
  stepUpToken: string
): Promise<RewrapResult> {
  return storeRewrap(await prepareRewrap(oldMasterKey, newMasterKey), reason, stepUpToken)
}

/** Whether a key, as a CryptoKey or raw bytes, opens text wrapped with encryptWithKey. */
async function opensWrappedText(masterKey: CryptoKey | ArrayBuffer, wrapped: string): Promise<boolean> {
  try {
    // A structural check rather than instanceof, which fails across realms.
    const isKey = typeof masterKey === 'object' && 'algorithm' in masterKey && 'usages' in masterKey
    const key = isKey ? (masterKey as CryptoKey) : await importMasterKey(masterKey as ArrayBuffer)
    await decryptWithKey(key, wrapped)
    return true
  } catch {
    return false
  }
}

/**
 * How to tell whether a key is the vault's current one: the oldest entry's data
 * key, or, when there are no entries, the connector ingestion key, which is
 * wrapped under the master key too. Null when the vault holds neither.
 */
function vaultCheck(
  material: Pick<RecoveryMaterial, 'probe' | 'ingest_key'>
): ((masterKey: CryptoKey | ArrayBuffer) => Promise<boolean>) | null {
  const { probe, ingest_key: ingestKey } = material
  if (probe) return (masterKey) => opensDataKey(masterKey, probe)
  if (ingestKey) return (masterKey) => opensWrappedText(masterKey, ingestKey.wrapped)
  return null
}

/** Whether the vault holds anything a lost master key would strand. */
export function vaultHasContent(material: Pick<RecoveryMaterial, 'probe' | 'ingest_key'>): boolean {
  return vaultCheck(material) !== null
}

/**
 * Whether the vault's content is wrapped under this key. False for a vault that
 * holds nothing, where nothing can confirm it, so a caller never mistakes
 * "nothing to check" for "already done".
 */
export async function vaultOpensWith(
  masterKey: CryptoKey,
  material: Pick<RecoveryMaterial, 'probe' | 'ingest_key'>
): Promise<boolean> {
  const check = vaultCheck(material)
  return check ? check(masterKey) : false
}

export type RecoveryAttempt =
  | {
      status: 'opened'
      masterKey: CryptoKey
      /** The connector key was stranded by an earlier password change and cannot be opened. */
      connectorKeyLost: boolean
    }
  | { status: 'not_a_secret' }
  | { status: 'no_match' }

/**
 * LD-105: open the vault's master key with a recovery code or a recovery kit
 * secret. A code is tried against the escrow and the code factor, a kit against
 * the kits, and a copy only counts if its key opens the vault's entries, so a
 * kit made before the last password change is refused rather than accepted
 * and then failing halfway through the re-wrap.
 */
export async function openVaultWithRecoverySecret(
  secret: string,
  material: RecoveryMaterial
): Promise<RecoveryAttempt> {
  const kind = recoverySecretKind(secret)
  if (!kind) return { status: 'not_a_secret' }

  const copies =
    kind === 'recovery_code'
      ? [
          ...(material.escrow ? [material.escrow] : []),
          ...material.factors.filter((factor) => factor.type === 'recovery_code'),
        ]
      : material.factors.filter((factor) => factor.type === 'recovery_kit')
  const wrappedCopies = copies.map((copy) => ({ wrapped: copy.wrapped_master_key, salt: copy.salt }))
  const check = vaultCheck(material)
  let raw = await findMasterKeyWithRecoverySecret(secret, wrappedCopies, check ?? undefined)
  let connectorKeyLost = false

  // The recovery code is replaced at every key change, so it wraps the current
  // key. On a vault with no entries, a code that opens a copy but not the
  // connector key means a password change before 2026-10-08 stranded that key,
  // not that the code is stale. Kits get no such allowance: a stale kit and a
  // stranded connector key look the same from here.
  if (!raw && kind === 'recovery_code' && !material.probe && material.ingest_key) {
    raw = await findMasterKeyWithRecoverySecret(secret, wrappedCopies)
    connectorKeyLost = raw !== null
  }
  return raw
    ? { status: 'opened', masterKey: await importMasterKey(raw), connectorKeyLost }
    : { status: 'no_match' }
}

export { deriveMasterKey }
