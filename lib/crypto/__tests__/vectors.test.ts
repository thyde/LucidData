import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import { deriveMasterKeyExtractable } from '../key-derivation'
import { decryptVaultEntry, arrayBufferToBase64, base64ToArrayBuffer } from '../client-crypto'

// The vault crypto relies on the Web Crypto API. Node exposes it globally, but
// fall back explicitly so the suite is portable across test environments/CI.
if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

// Known-answer vectors for the vault envelope.
//
// These exist because the vault has to open on more than one runtime. The web
// app runs in a browser, LD-204 puts the same vault in a React Native app, and
// those runtimes supply different implementations of the same primitives. A
// vector computed once and pinned here is what makes "the same password opens
// the same vault on both surfaces" a testable claim rather than an intention.
//
// They also freeze the parameters. PBKDF2 iterations, the key length, the IV
// length, and the base64 encoding are all load-bearing: change any of them and
// every existing vault becomes unreadable. If one of these assertions fails,
// the correct response is almost never to update the vector.
//
// Generated independently with Node's WebCrypto, not by running this codebase,
// so they check our implementation rather than restate it. The password is a
// well-known example string and protects nothing.
const VECTOR = {
  password: 'correct horse battery staple',
  saltB64: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=',
  plaintext: '{"note":"cross-surface vector","n":42}',
  masterKeyHex: '5df6aff100470456c8d603ade50c344ace2f3db43ef4d82a53102aacf01192ed',
  client_ciphertext:
    'EBESExQVFhcYGRobBtz2eT2sGInoFnpyfApEIKIiKG94p3fHgpqWCCx2ePk+y203x9t1FksDyeWSNfSgSf9zlP/t',
  encrypted_dek: 'UonTEwnxpyc5rtXikFyR1NliaGGbPBa7BKUIEXNNTiBGxGBWgn7y0LVOtMPIAdRR',
  dek_salt: 'oKGio6Slpqeoqaqr',
} as const

describe('vault crypto known-answer vectors', () => {
  it('derives the pinned master key from the pinned password and salt', async () => {
    const key = await deriveMasterKeyExtractable(VECTOR.password, VECTOR.saltB64)
    const raw = await crypto.subtle.exportKey('raw', key)
    const hex = Buffer.from(new Uint8Array(raw)).toString('hex')

    expect(hex).toBe(VECTOR.masterKeyHex)
  })

  it('opens an envelope encrypted outside this codebase', async () => {
    const key = await deriveMasterKeyExtractable(VECTOR.password, VECTOR.saltB64)

    const plaintext = await decryptVaultEntry(
      key,
      VECTOR.client_ciphertext,
      VECTOR.encrypted_dek,
      VECTOR.dek_salt
    )

    expect(plaintext).toBe(VECTOR.plaintext)
  })

  it('rejects the envelope when the password is wrong', async () => {
    const key = await deriveMasterKeyExtractable('not the password', VECTOR.saltB64)

    await expect(
      decryptVaultEntry(key, VECTOR.client_ciphertext, VECTOR.encrypted_dek, VECTOR.dek_salt)
    ).rejects.toThrow()
  })
})

describe('base64 conversion', () => {
  // Base64 is the wire format for every ciphertext, key, and salt the vault
  // stores, so an encoder that disagrees with the browser's by one byte makes
  // vaults unreadable. Checked against Node's Buffer as an independent
  // implementation, across the three padding cases and the high byte range
  // that a naive string-based encoder gets wrong.
  const cases: Array<[string, Uint8Array]> = [
    ['empty', new Uint8Array(0)],
    ['one byte, two padding chars', new Uint8Array([0x66])],
    ['two bytes, one padding char', new Uint8Array([0x66, 0x6f])],
    ['three bytes, no padding', new Uint8Array([0x66, 0x6f, 0x6f])],
    ['all high bytes', new Uint8Array([0xff, 0xfe, 0xfd, 0xfc])],
    ['a zero byte', new Uint8Array([0x00, 0x00, 0x00])],
    ['full byte range', Uint8Array.from({ length: 256 }, (_, i) => i)],
  ]

  it.each(cases)('encodes %s the same way Node does', (_name, bytes) => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

    expect(arrayBufferToBase64(buffer as ArrayBuffer)).toBe(Buffer.from(bytes).toString('base64'))
  })

  it.each(cases)('round-trips %s without loss', (_name, bytes) => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const restored = new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(buffer as ArrayBuffer)))

    expect(Array.from(restored)).toEqual(Array.from(bytes))
  })

  it('decodes what Node encodes', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => 255 - i)
    const encoded = Buffer.from(bytes).toString('base64')

    const decoded = new Uint8Array(base64ToArrayBuffer(encoded))

    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })
})
