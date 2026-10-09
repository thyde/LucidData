import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import { isShareKey, openShare, sealShare, shareKeyFromHash } from '../share-link'
import { base64ToBytes, bytesToBase64 } from '../runtime'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

// Known-answer vector for LD-305. The key is the bytes 0 to 31 and the IV the
// bytes 0xa0 to 0xab. The ciphertext was produced with node:crypto's
// aes-256-gcm cipher, not with Web Crypto and not by running this code, so a
// change to the format or the key encoding fails here.
const VECTOR_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const VECTOR_PLAINTEXT = 'A shared summary: 8,412 steps on 2026-09-30.'
const VECTOR_CIPHERTEXT =
  'oKGio6SlpqeoqaqrpzgPRSS5Z9tCFvK+ahuyp0qMYTymhnBM73pD9gyLGm/yRHfNmQ9jBHKvNOapL296tKNBfzHKVwseqikn'

describe('share link keys', () => {
  it('opens the known-answer vector', async () => {
    await expect(openShare(VECTOR_CIPHERTEXT, VECTOR_KEY)).resolves.toBe(VECTOR_PLAINTEXT)
  })

  it('round-trips a summary under a fresh key', async () => {
    const summary = JSON.stringify({ version: 1, note: 'Sleep since the new medication', steps: [8412, 9120] })
    const sealed = await sealShare(summary)
    expect(isShareKey(sealed.key)).toBe(true)
    await expect(openShare(sealed.ciphertext, sealed.key)).resolves.toBe(summary)
  })

  it('makes a new key and IV for every share', async () => {
    const one = await sealShare('same summary')
    const two = await sealShare('same summary')
    expect(one.key).not.toBe(two.key)
    expect(one.ciphertext).not.toBe(two.ciphertext)
    expect(base64ToBytes(one.ciphertext).slice(0, 12)).not.toEqual(base64ToBytes(two.ciphertext).slice(0, 12))
  })

  it('keeps the key out of what the server stores', async () => {
    const sealed = await sealShare('A summary the server must not read')
    expect(sealed.ciphertext).not.toContain(sealed.key)
    expect(sealed.ciphertext).not.toContain('summary')
    // The stored form is the IV, the ciphertext, and a 16-byte tag, nothing else.
    expect(base64ToBytes(sealed.ciphertext)).toHaveLength(12 + 'A summary the server must not read'.length + 16)
  })

  it('refuses the wrong key', async () => {
    const sealed = await sealShare('private')
    const other = await sealShare('private')
    await expect(openShare(sealed.ciphertext, other.key)).rejects.toThrow()
  })

  it('refuses a changed ciphertext', async () => {
    const bytes = base64ToBytes(VECTOR_CIPHERTEXT)
    bytes[20] ^= 0x01
    await expect(openShare(bytesToBase64(bytes), VECTOR_KEY)).rejects.toThrow()
  })

  it('refuses anything that is not a whole share key', async () => {
    for (const key of ['', VECTOR_KEY.slice(0, 42), `${VECTOR_KEY}A`, `${VECTOR_KEY.slice(0, 42)}+`, `${VECTOR_KEY.slice(0, 42)}=`]) {
      expect(isShareKey(key)).toBe(false)
      await expect(openShare(VECTOR_CIPHERTEXT, key)).rejects.toThrow('This is not a share key')
    }
  })

  it('reads the key from a fragment, and nothing else', () => {
    expect(shareKeyFromHash(`#${VECTOR_KEY}`)).toBe(VECTOR_KEY)
    expect(shareKeyFromHash(VECTOR_KEY)).toBe(VECTOR_KEY)
    expect(shareKeyFromHash('')).toBeNull()
    expect(shareKeyFromHash('#')).toBeNull()
    expect(shareKeyFromHash(`#${VECTOR_KEY.slice(0, 40)}`)).toBeNull()
    expect(shareKeyFromHash(`#k=${VECTOR_KEY}`)).toBeNull()
  })

  it('encodes keys with the URL-safe alphabet and no padding', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { key } = await sealShare('x')
      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
  })
})
