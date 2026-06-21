// Browser-only recovery-code helpers.
//
// A recovery code lets a user regain access to their vault after a password reset.
// We escrow an extractable copy of the master key, AES-GCM-wrapped with a key
// derived (PBKDF2) from a high-entropy one-time code that only the user holds. The
// server stores the wrapped bytes and the PBKDF2 salt, never the code itself.

import { arrayBufferToBase64, base64ToArrayBuffer, encryptWithKey, decryptWithKey } from '@/lib/crypto/client-crypto'

// Crockford base32 alphabet (no I, L, O, U) -- 32 chars, divides 256 evenly so a
// byte modulo 32 is uniform with no rejection needed.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 25 // 25 * 5 = 125 bits of entropy
const GROUP_SIZE = 5

// Generate a formatted recovery code, e.g. "A1B2C-D3E4F-G5H6J-K7M8N-P9Q0R".
export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
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
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return arrayBufferToBase64(salt.buffer)
}

// Derive an AES-GCM key from a recovery code + stored salt (PBKDF2, 600k).
export async function deriveRecoveryKey(code: string, saltB64: string): Promise<CryptoKey> {
  const saltBytes = new Uint8Array(base64ToArrayBuffer(saltB64))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizeRecoveryCode(code)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600_000, hash: 'SHA-256' },
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
