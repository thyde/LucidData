// LD-112: open the vault with a passkey.
//
// The WebAuthn PRF extension lets a passkey turn an input into a secret that
// only that passkey can produce, the same secret every time. HKDF turns that
// secret into an AES-GCM key, which wraps a copy of the master key the way a
// recovery kit does. The server stores the wrapped copy and the input, which
// is a salt rather than a secret; the PRF output never leaves the device, so
// the server still cannot open the vault.

import { arrayBufferToBase64, base64ToArrayBuffer, decryptWithKey, encryptWithKey } from './client-crypto'
import { asBytes, base64ToBytes, bytesToBase64, encodeUtf8, getSubtle, randomBytes } from './runtime'

/** The length of the PRF input stored with a factor. */
export const PASSKEY_SALT_BYTES = 32

/** A PRF output is 32 bytes; anything shorter is not one. */
const PRF_OUTPUT_BYTES = 32

// Binds the derived key to this one use, so the same PRF output can never
// produce a key that means something elsewhere.
const INFO = 'LucidData passkey vault unlock v1'

/** A fresh PRF input for a new passkey factor, as base64. */
export function generatePasskeySalt(): string {
  return bytesToBase64(randomBytes(PASSKEY_SALT_BYTES))
}

/** The bytes to hand the authenticator as the PRF input for a factor. */
export function passkeyPrfInput(saltB64: string): Uint8Array {
  return base64ToBytes(saltB64)
}

/** The 256 bits HKDF-SHA-256 derives from a PRF output, salted with the factor's input. */
export async function derivePasskeyWrappingBits(prfOutput: BufferSource, saltB64: string): Promise<ArrayBuffer> {
  const output = asBytes(prfOutput as ArrayBuffer)
  if (output.byteLength < PRF_OUTPUT_BYTES) throw new Error('A passkey PRF output is 32 bytes')
  const subtle = getSubtle()
  const material = await subtle.importKey('raw', output, 'HKDF', false, ['deriveBits'])
  return subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: base64ToBytes(saltB64), info: encodeUtf8(INFO) },
    material,
    256
  )
}

/** The AES-GCM key that wraps the master key for one passkey. */
export async function derivePasskeyWrappingKey(prfOutput: BufferSource, saltB64: string): Promise<CryptoKey> {
  const bits = await derivePasskeyWrappingBits(prfOutput, saltB64)
  return getSubtle().importKey('raw', bits, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** Wrap the raw master key for a passkey; returns base64(iv + ciphertext). */
export async function wrapMasterKeyForPasskey(rawMasterKey: ArrayBuffer, wrappingKey: CryptoKey): Promise<string> {
  return encryptWithKey(wrappingKey, arrayBufferToBase64(rawMasterKey))
}

/** Unwrap the master key a passkey wrapped. Fails, as AES-GCM does, on any other key. */
export async function unwrapMasterKeyForPasskey(wrappedB64: string, wrappingKey: CryptoKey): Promise<ArrayBuffer> {
  return base64ToArrayBuffer(await decryptWithKey(wrappingKey, wrappedB64))
}
