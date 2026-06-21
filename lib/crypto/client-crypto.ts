// All functions are browser-only (Web Crypto API)

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// Encrypt plaintext string; returns base64(iv + ciphertext)
export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), 12)
  return arrayBufferToBase64(result.buffer)
}

// Decrypt base64(iv + ciphertext) with key
export async function decryptWithKey(key: CryptoKey, ciphertextB64: string): Promise<string> {
  const data = new Uint8Array(base64ToArrayBuffer(ciphertextB64))
  const iv = data.slice(0, 12)
  const ciphertext = data.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// Generate a random DEK as a CryptoKey
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

// Export DEK to raw bytes
export async function exportDEK(dek: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', dek)
}

// Import raw bytes as AES-GCM CryptoKey
export async function importDEK(rawKey: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
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
  const dekIv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedDekBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dekIv }, masterKey, rawDek)
  const dek_salt = arrayBufferToBase64(dekIv.buffer)
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
  const dekIv = new Uint8Array(base64ToArrayBuffer(dek_salt))
  const encryptedDekBytes = base64ToArrayBuffer(encrypted_dek)
  const rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dekIv }, masterKey, encryptedDekBytes)
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
  const oldIv = new Uint8Array(base64ToArrayBuffer(dek_salt))
  const rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: oldIv }, oldMasterKey, base64ToArrayBuffer(encrypted_dek))
  const newIv = crypto.getRandomValues(new Uint8Array(12))
  const reEncrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, newMasterKey, rawDek)
  return {
    encrypted_dek: arrayBufferToBase64(reEncrypted),
    dek_salt: arrayBufferToBase64(newIv.buffer),
  }
}
