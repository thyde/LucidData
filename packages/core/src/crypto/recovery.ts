// Recovery-code and recovery-kit helpers. They run wherever the vault opens: a
// browser, the phone app, or an extension, through ./runtime.
//
// A recovery code lets a user regain access to their vault after a password reset.
// We escrow an extractable copy of the master key, AES-GCM-wrapped with a key
// derived (PBKDF2) from a high-entropy one-time code that only the user holds. The
// server stores the wrapped bytes and the PBKDF2 salt, never the code itself.

import { base64ToArrayBuffer, encryptWithKey, decryptWithKey, arrayBufferToBase64 } from './client-crypto'
import { asBytes, base64ToBytes, bytesToBase64, encodeUtf8, getSubtle, randomBytes } from './runtime'

// Crockford base32 alphabet (no I, L, O, U) -- 32 chars, divides 256 evenly so a
// byte modulo 32 is uniform with no rejection needed.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 25 // 25 * 5 = 125 bits of entropy
const GROUP_SIZE = 5

// Generate a formatted recovery code, e.g. "A1B2C-D3E4F-G5H6J-K7M8N-P9Q0R".
export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % 32]
    if (i % GROUP_SIZE === GROUP_SIZE - 1 && i < CODE_LENGTH - 1) out += '-'
  }
  return out
}

// Strip formatting and map visually ambiguous characters so user-typed codes match.
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '')
}

export function generateRecoverySalt(): string {
  return bytesToBase64(randomBytes(16))
}

// Derive an AES-GCM key from a recovery code + stored salt (PBKDF2, 600k).
export async function deriveRecoveryKey(code: string, saltB64: string): Promise<CryptoKey> {
  const subtle = getSubtle()
  const keyMaterial = await subtle.importKey(
    'raw',
    encodeUtf8(normalizeRecoveryCode(code)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(saltB64), iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Wrap the raw master-key bytes with the recovery key; returns base64(iv + ciphertext).
export async function wrapMasterKeyForRecovery(rawMasterKey: ArrayBuffer, recoveryKey: CryptoKey): Promise<string> {
  return encryptWithKey(recoveryKey, arrayBufferToBase64(rawMasterKey))
}

// Unwrap the escrowed master key; returns the raw key bytes.
export async function unwrapMasterKeyForRecovery(wrappedB64: string, recoveryKey: CryptoKey): Promise<ArrayBuffer> {
  const rawB64 = await decryptWithKey(recoveryKey, wrappedB64)
  return base64ToArrayBuffer(rawB64)
}

// LD-105: a second, independent recovery factor.
//
// A recovery kit is a 256-bit random secret the user downloads and keeps
// somewhere separate from the printed code (a password manager, another
// device). It wraps the master key through exactly the same PBKDF2 + AES-GCM
// path, so there is no new primitive here, only a second thing that can open
// the escrow if the first one is lost.
const KIT_SECRET_BYTES = 32
const KIT_GROUP_SIZE = 8

// Generate a formatted recovery kit secret, e.g. "A1B2C3D4-E5F6G7H8-...".
export function generateRecoveryKitSecret(): string {
  const bytes = randomBytes(KIT_SECRET_BYTES)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] % 32]
    if (i % KIT_GROUP_SIZE === KIT_GROUP_SIZE - 1 && i < bytes.length - 1) out += '-'
  }
  return out
}

// Kit secrets use the same alphabet and normalization rules as recovery codes,
// so a user typing one back in gets the same forgiveness for 0/O and 1/I/L.
export const normalizeRecoveryKitSecret = normalizeRecoveryCode

// Derive an AES-GCM key from a recovery kit secret + stored salt (PBKDF2, 600k).
export const deriveRecoveryKitKey = deriveRecoveryKey

// LD-105: open the vault with whichever recovery factor the person still has.

export type RecoverySecretKind = 'recovery_code' | 'recovery_kit'

/**
 * Which kind of secret was typed, judged by its length once formatting is
 * stripped: a recovery code has 25 characters and a kit secret 32. Null when it
 * is neither, so a typo is reported at once rather than after a slow derivation.
 */
export function recoverySecretKind(input: string): RecoverySecretKind | null {
  const length = normalizeRecoveryCode(input).length
  if (length === CODE_LENGTH) return 'recovery_code'
  if (length === KIT_SECRET_BYTES) return 'recovery_kit'
  return null
}

/** One wrapped copy of the master key: the recovery-code escrow, or a factor. */
export interface WrappedMasterKeyCopy {
  wrapped: string
  salt: string
}

/** One vault entry's wrapped data key, used to check that a recovered key is current. */
export interface DataKeyProbe {
  encrypted_dek: string
  dek_salt: string
}

/**
 * Open the master key with a recovery code or a kit secret.
 *
 * Each copy is wrapped under its own salt, so the secret is tried against each
 * distinct copy in turn, and the raw key bytes from the first that opens are
 * returned. A copy can open and still be stale: one made before a password
 * change wraps a key that no longer opens anything. When the vault holds data,
 * pass one entry's wrapped data key as `probe`, and a copy then counts only if
 * its key unwraps it. Returns null when no copy qualifies.
 */
export async function openMasterKeyWithRecoverySecret(
  secret: string,
  copies: readonly WrappedMasterKeyCopy[],
  probe?: DataKeyProbe | null
): Promise<ArrayBuffer | null> {
  return findMasterKeyWithRecoverySecret(
    secret,
    copies,
    probe ? (rawMasterKey) => opensDataKey(rawMasterKey, probe) : undefined
  )
}

/**
 * The same search, with the caller deciding whether an opened copy is the
 * vault's current key, for a vault whose only content is not an entry.
 */
export async function findMasterKeyWithRecoverySecret(
  secret: string,
  copies: readonly WrappedMasterKeyCopy[],
  accepts?: (rawMasterKey: ArrayBuffer) => Promise<boolean>
): Promise<ArrayBuffer | null> {
  const tried = new Set<string>()
  for (const copy of copies) {
    const id = JSON.stringify([copy.salt, copy.wrapped])
    if (tried.has(id)) continue
    tried.add(id)

    let raw: ArrayBuffer
    try {
      raw = await unwrapMasterKeyForRecovery(copy.wrapped, await deriveRecoveryKey(secret, copy.salt))
    } catch {
      continue
    }
    if (!accepts || (await accepts(raw))) return raw
  }
  return null
}

/** Whether a master key, as a key or as raw bytes, unwraps the probe entry's data key. */
export async function opensDataKey(
  masterKey: CryptoKey | ArrayBuffer,
  probe: DataKeyProbe
): Promise<boolean> {
  try {
    const subtle = getSubtle()
    // Not `instanceof ArrayBuffer`: buffers from another realm, such as jsdom's or
    // React Native's, would fail that check and be mistaken for a key.
    const key = isCryptoKey(masterKey)
      ? masterKey
      : await subtle.importKey('raw', asBytes(masterKey), { name: 'AES-GCM', length: 256 }, false, [
          'decrypt',
        ])
    await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(probe.dek_salt) },
      key,
      base64ToBytes(probe.encrypted_dek)
    )
    return true
  } catch {
    return false
  }
}

function isCryptoKey(value: CryptoKey | ArrayBuffer): value is CryptoKey {
  return typeof value === 'object' && value !== null && 'algorithm' in value && 'usages' in value
}
