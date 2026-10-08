import { describe, it, expect, afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
  getSubtle,
  randomBytes,
} from '../runtime'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const originalCrypto = globalThis.crypto

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    configurable: true,
    writable: true,
  })
})

function removeCrypto(replacement: unknown) {
  Object.defineProperty(globalThis, 'crypto', {
    value: replacement,
    configurable: true,
    writable: true,
  })
}

describe('getSubtle', () => {
  it('returns the host implementation when one is present', () => {
    expect(getSubtle()).toBe(globalThis.crypto.subtle)
  })

  it('explains what to do when the runtime has no Web Crypto', () => {
    removeCrypto(undefined)

    // The message is the point. This is the first failure anyone hits when
    // taking the vault to a new runtime, and a bare TypeError on an undefined
    // property sends them looking in the wrong place.
    expect(() => getSubtle()).toThrow(/React Native/)
  })

  it('refuses a partial implementation rather than failing later', () => {
    // A polyfill that provides getRandomValues but no subtle would otherwise
    // pass a truthiness check and fail deep inside a derivation.
    removeCrypto({ getRandomValues: () => new Uint8Array(0) })

    expect(() => getSubtle()).toThrow(/Web Crypto is not available/)
  })
})

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(12)).toHaveLength(12)
    expect(randomBytes(32)).toHaveLength(32)
  })

  it('does not repeat itself', () => {
    // Every IV in the vault comes from here, and AES-GCM fails catastrophically
    // on a reused IV, so a stub that returned a constant must not pass.
    const runs = Array.from({ length: 50 }, () => bytesToBase64(randomBytes(12)))

    expect(new Set(runs).size).toBe(runs.length)
  })

  it('refuses to produce bytes when the runtime has no Web Crypto', () => {
    removeCrypto(undefined)

    expect(() => randomBytes(12)).toThrow(/Web Crypto is not available/)
  })
})

describe('base64', () => {
  it('rejects characters outside the alphabet', () => {
    // Skipping them would turn a corrupted ciphertext into a shorter
    // valid-looking one, which surfaces as a confusing decryption failure
    // instead of an obvious input problem.
    expect(() => base64ToBytes('abc$def')).toThrow(/Invalid base64/)
  })

  it('accepts input with and without padding', () => {
    expect(Array.from(base64ToBytes('Zm8='))).toEqual([0x66, 0x6f])
    expect(Array.from(base64ToBytes('Zm8'))).toEqual([0x66, 0x6f])
  })

  it('handles input large enough to break a naive implementation', () => {
    // Building a binary string with String.fromCharCode and a spread overflows
    // the call stack somewhere around 100k arguments. A vault export is easily
    // this size.
    const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => i % 256)

    const restored = base64ToBytes(bytesToBase64(bytes))

    expect(restored).toHaveLength(bytes.length)
    expect(restored[0]).toBe(bytes[0])
    expect(restored[299_999]).toBe(bytes[299_999])
  })
})

describe('utf8', () => {
  it('round-trips text outside the ASCII range', () => {
    // Vault entries hold arbitrary user text. An encoder that assumed one byte
    // per character would corrupt names and emoji on the way in.
    const text = 'café 東京 👋 \u0000 end'

    expect(decodeUtf8(encodeUtf8(text))).toBe(text)
  })

  it('encodes multi-byte characters to more bytes than characters', () => {
    expect(encodeUtf8('é').length).toBe(2)
    expect(encodeUtf8('東').length).toBe(3)
  })
})
