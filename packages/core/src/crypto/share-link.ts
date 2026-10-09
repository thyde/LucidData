// LD-305: the key behind a health summary shared by link.
//
// Each share gets its own AES-GCM 256 key, made on the person's device. The
// summary is encrypted with it, and the key travels only in the link, after
// the # sign. Browsers never send that part of a link to a server, so the
// server stores a summary it cannot open. Anyone holding the whole link can.
//
// The ciphertext uses the vault's format, base64 of a 12-byte IV followed by
// the ciphertext and tag, from the same helpers.

import { decryptWithKey, encryptWithKey, exportDEK, generateDEK, importDEK } from './client-crypto'
import { base64ToBytes, bytesToBase64 } from './runtime'

/** A 32-byte key as unpadded base64url is always 43 characters. */
const SHARE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface SealedShare {
  /** What the server stores: base64 of the IV, ciphertext, and tag. */
  ciphertext: string
  /** What only the link carries: the raw key as unpadded base64url. */
  key: string
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return base64ToBytes(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
}

/** Whether text could be a share key, before trying to use it. */
export function isShareKey(text: string): boolean {
  return SHARE_KEY_PATTERN.test(text)
}

/** The key from a link's fragment, or null when it is missing or mangled. */
export function shareKeyFromHash(hash: string): string | null {
  const key = hash.startsWith('#') ? hash.slice(1) : hash
  return isShareKey(key) ? key : null
}

/** Encrypt a summary under a key made for this share alone. */
export async function sealShare(plaintext: string): Promise<SealedShare> {
  const key = await generateDEK()
  const ciphertext = await encryptWithKey(key, plaintext)
  const raw = new Uint8Array(await exportDEK(key))
  return { ciphertext, key: toBase64Url(raw) }
}

/**
 * Decrypt a summary with the key from its link. Throws on a key that is not a
 * share key, and on any change to the ciphertext, which the tag catches.
 */
export async function openShare(ciphertext: string, key: string): Promise<string> {
  if (!isShareKey(key)) throw new Error('This is not a share key')
  const cryptoKey = await importDEK(fromBase64Url(key).buffer)
  return decryptWithKey(cryptoKey, ciphertext)
}
