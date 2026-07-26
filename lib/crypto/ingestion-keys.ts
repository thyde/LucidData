/**
 * LD-201 sealed-box ingestion keys.
 *
 * A background sync worker runs with nobody present, so it cannot have the
 * master key. If it could decrypt what it writes, the privacy claim would end
 * the moment automation began, and every connector would quietly turn LucidData
 * into an ordinary data processor.
 *
 * So the worker gets a public key and nothing else. It seals each normalized
 * record to that key and writes the ciphertext. Opening it requires the private
 * half, which is wrapped by the master key and only ever unwrapped in the
 * browser after unlock.
 *
 * The sealed box is ECDH P-256 plus AES-GCM: an ephemeral keypair per record,
 * a shared secret derived against the recipient's public key, and the ephemeral
 * public key travelling with the ciphertext. The sender keeps no key material,
 * so a compromised worker cannot decrypt yesterday's records either.
 *
 * P-256 rather than X25519 because Web Crypto supports it everywhere today and
 * a connector that only works in one browser is not a connector.
 *
 * Browser only. Every function here uses the Web Crypto API except sealing,
 * which the Node worker also performs.
 */

import { arrayBufferToBase64 } from '@/lib/crypto/client-crypto'
import { base64ToBytes } from '@/lib/crypto/runtime'

const CURVE = 'P-256'
const IV_BYTES = 12

export interface IngestionKeypair {
  /** Published to the server so the worker can seal to it. */
  publicKeyB64: string
  /** Raw private key, to be wrapped before it goes anywhere. */
  privateKeyB64: string
}

/**
 * Generate the person's ingestion keypair. Called once in the browser, at
 * registration or at first connect.
 */
export async function generateIngestionKeypair(): Promise<IngestionKeypair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, [
    'deriveKey',
  ])
  const publicKey = await crypto.subtle.exportKey('spki', pair.publicKey)
  const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  return {
    publicKeyB64: arrayBufferToBase64(publicKey),
    privateKeyB64: arrayBufferToBase64(privateKey),
  }
}

async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    base64ToBytes(publicKeyB64),
    { name: 'ECDH', namedCurve: CURVE },
    false,
    []
  )
}

async function importPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyB64),
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveKey']
  )
}

async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Seal a payload to a public key.
 *
 * The output is base64(ephemeralPublicKey || iv || ciphertext). The ephemeral
 * private key is discarded when this returns, which is what makes a stolen
 * worker useless against records it already wrote.
 */
export async function sealToPublicKey(
  recipientPublicKeyB64: string,
  plaintext: string
): Promise<string> {
  const recipient = await importPublicKey(recipientPublicKeyB64)
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveKey']
  )
  const shared = await deriveSharedKey(ephemeral.privateKey, recipient)

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    shared,
    new TextEncoder().encode(plaintext)
  )
  const ephemeralPublic = new Uint8Array(
    await crypto.subtle.exportKey('spki', ephemeral.publicKey)
  )

  // Two bytes of length prefix, because an SPKI export is not fixed width
  // across implementations and guessing at the offset would fail silently on
  // exactly the platform we did not test.
  const out = new Uint8Array(2 + ephemeralPublic.length + IV_BYTES + ciphertext.byteLength)
  out[0] = (ephemeralPublic.length >> 8) & 0xff
  out[1] = ephemeralPublic.length & 0xff
  out.set(ephemeralPublic, 2)
  out.set(iv, 2 + ephemeralPublic.length)
  out.set(new Uint8Array(ciphertext), 2 + ephemeralPublic.length + IV_BYTES)
  return arrayBufferToBase64(out.buffer)
}

export class SealedBoxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SealedBoxError'
  }
}

/** Open a sealed payload with the recipient's private key. */
export async function openSealed(
  recipientPrivateKeyB64: string,
  sealedB64: string
): Promise<string> {
  const bytes = base64ToBytes(sealedB64)
  if (bytes.length < 2 + IV_BYTES + 1) {
    throw new SealedBoxError('Sealed payload is truncated')
  }

  const ephemeralLength = (bytes[0] << 8) | bytes[1]
  if (bytes.length < 2 + ephemeralLength + IV_BYTES) {
    throw new SealedBoxError('Sealed payload is truncated')
  }

  const ephemeralPublic = bytes.slice(2, 2 + ephemeralLength)
  const iv = bytes.slice(2 + ephemeralLength, 2 + ephemeralLength + IV_BYTES)
  const ciphertext = bytes.slice(2 + ephemeralLength + IV_BYTES)

  const privateKey = await importPrivateKey(recipientPrivateKeyB64)
  const ephemeral = await crypto.subtle.importKey(
    'spki',
    ephemeralPublic,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    []
  )
  const shared = await deriveSharedKey(privateKey, ephemeral)

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, shared, ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    // AES-GCM authenticates, so this is a wrong key or a tampered payload. Do
    // not report which, and never return partial plaintext.
    throw new SealedBoxError('Could not open this record')
  }
}
