// AES-GCM envelope encryption for vault entries.
//
// Runs on any runtime that provides Web Crypto. Browser globals are reached
// through ./runtime so an entry encrypted in the web app can be decrypted in
// the React Native app and the reverse.

import {
  asBytes,
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
  getSubtle,
  randomBytes,
} from './runtime'

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer))
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToBytes(base64).buffer as ArrayBuffer
}

// Encrypt plaintext string; returns base64(iv + ciphertext)
export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = randomBytes(12)
  const encoded = encodeUtf8(plaintext)
  const ciphertext = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), 12)
  return bytesToBase64(result)
}

// Decrypt base64(iv + ciphertext) with key
export async function decryptWithKey(key: CryptoKey, ciphertextB64: string): Promise<string> {
  const data = base64ToBytes(ciphertextB64)
  const iv = data.slice(0, 12)
  const ciphertext = data.slice(12)
  const plaintext = await getSubtle().decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return decodeUtf8(new Uint8Array(plaintext))
}

// Generate a random DEK as a CryptoKey
export async function generateDEK(): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

// Export DEK to raw bytes
export async function exportDEK(dek: CryptoKey): Promise<ArrayBuffer> {
  return getSubtle().exportKey('raw', dek)
}

// Import raw bytes as AES-GCM CryptoKey
export async function importDEK(rawKey: ArrayBuffer): Promise<CryptoKey> {
  return getSubtle().importKey('raw', asBytes(rawKey), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export interface EncryptedEntry {
  client_ciphertext: string  // base64(iv + encrypted_data)
  encrypted_dek: string      // base64(iv + encrypted_raw_dek)
  dek_salt: string           // base64(12-byte IV used to encrypt DEK with master key)
}

// Encrypt a plaintext string, returning all three storage fields
export async function encryptVaultEntry(masterKey: CryptoKey, plaintext: string): Promise<EncryptedEntry> {
  // Generate and use a fresh DEK
  const dek = await generateDEK()
  const rawDek = await exportDEK(dek)

  // Encrypt the plaintext with the DEK
  const client_ciphertext = await encryptWithKey(dek, plaintext)

  // Encrypt the raw DEK with the master key
  const dekIv = randomBytes(12)
  const encryptedDekBytes = await getSubtle().encrypt({ name: 'AES-GCM', iv: dekIv }, masterKey, rawDek)
  const dek_salt = bytesToBase64(dekIv)
  const encrypted_dek = arrayBufferToBase64(encryptedDekBytes)

  return { client_ciphertext, encrypted_dek, dek_salt }
}

// Decrypt a vault entry back to plaintext
export async function decryptVaultEntry(
  masterKey: CryptoKey,
  client_ciphertext: string,
  encrypted_dek: string,
  dek_salt: string
): Promise<string> {
  // Decrypt the DEK with master key
  const dekIv = base64ToBytes(dek_salt)
  const encryptedDekBytes = base64ToBytes(encrypted_dek)
  const rawDek = await getSubtle().decrypt({ name: 'AES-GCM', iv: dekIv }, masterKey, encryptedDekBytes)
  const dek = await importDEK(rawDek)

  // Decrypt the data with DEK
  return decryptWithKey(dek, client_ciphertext)
}

// Re-wrap an entry's DEK from an old master key to a new one. Only the DEK envelope
// changes (encrypted_dek + dek_salt); client_ciphertext is untouched. Used by
// change-password and recovery flows.
export async function rewrapDek(
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey,
  encrypted_dek: string,
  dek_salt: string
): Promise<{ encrypted_dek: string; dek_salt: string }> {
  const subtle = getSubtle()
  const oldIv = base64ToBytes(dek_salt)
  const rawDek = await subtle.decrypt({ name: 'AES-GCM', iv: oldIv }, oldMasterKey, base64ToBytes(encrypted_dek))
  const newIv = randomBytes(12)
  const reEncrypted = await subtle.encrypt({ name: 'AES-GCM', iv: newIv }, newMasterKey, asBytes(rawDek))
  return {
    encrypted_dek: arrayBufferToBase64(reEncrypted),
    dek_salt: bytesToBase64(newIv),
  }
}
