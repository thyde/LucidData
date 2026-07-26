// Derives a CryptoKey from password + salt using PBKDF2.
//
// Runs on any runtime that provides Web Crypto. Browser globals are reached
// through ./runtime so the same derivation works in the web app, in Node during
// tests, and in the React Native app, where a vault created on one surface must
// open on another. See lib/crypto/__tests__/vectors.test.ts for the pinned
// vector that holds that guarantee in place.

import { asBytes, base64ToBytes, bytesToBase64, encodeUtf8, getSubtle, randomBytes } from './runtime'

async function derive(password: string, saltB64: string, extractable: boolean): Promise<CryptoKey> {
  const subtle = getSubtle()
  const saltBytes = base64ToBytes(saltB64)
  const keyMaterial = await subtle.importKey(
    'raw',
    encodeUtf8(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  )
}

// Normal in-memory master key: non-extractable so its raw bytes never leave the key store.
export async function deriveMasterKey(password: string, saltB64: string): Promise<CryptoKey> {
  return derive(password, saltB64, false)
}

// Extractable copy of the master key, used ONLY to escrow it under a recovery code.
export async function deriveMasterKeyExtractable(password: string, saltB64: string): Promise<CryptoKey> {
  return derive(password, saltB64, true)
}

// Import raw master-key bytes (e.g. recovered from escrow) as a non-extractable AES-GCM key.
export async function importMasterKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
  return getSubtle().importKey('raw', asBytes(rawKey), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export function generateKeySalt(): string {
  return bytesToBase64(randomBytes(32))
}
