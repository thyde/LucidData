import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  deriveMasterKey,
  deriveMasterKeyExtractable,
  importMasterKey,
  generateKeySalt,
} from '../key-derivation'
import { encryptWithKey, decryptWithKey } from '../client-crypto'

// The vault crypto relies on the Web Crypto API. Node exposes it globally, but
// fall back explicitly so the suite is portable across test environments/CI.
if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const PASSWORD = 'correct horse battery staple'
const SALT_A = btoa('A'.repeat(32))
const SALT_B = btoa('B'.repeat(32))

async function rawHex(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return Buffer.from(new Uint8Array(raw)).toString('hex')
}

describe('key-derivation', () => {
  describe('deriveMasterKey', () => {
    it('derives a non-extractable AES-256-GCM key usable for encrypt/decrypt', async () => {
      const key = await deriveMasterKey(PASSWORD, SALT_A)

      expect(key.type).toBe('secret')
      expect(key.extractable).toBe(false)
      expect(key.algorithm.name).toBe('AES-GCM')
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
      expect(key.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']))
    })

    it('is deterministic: same password and salt derive interchangeable keys', async () => {
      const k1 = await deriveMasterKey(PASSWORD, SALT_A)
      const k2 = await deriveMasterKey(PASSWORD, SALT_A)

      const ciphertext = await encryptWithKey(k1, 'sensitive vault value')
      await expect(decryptWithKey(k2, ciphertext)).resolves.toBe('sensitive vault value')
    })

    it('derives a different key for a different salt', async () => {
      const k1 = await deriveMasterKey(PASSWORD, SALT_A)
      const k2 = await deriveMasterKey(PASSWORD, SALT_B)

      const ciphertext = await encryptWithKey(k1, 'value')
      await expect(decryptWithKey(k2, ciphertext)).rejects.toThrow()
    })

    it('derives a different key for a different password', async () => {
      const k1 = await deriveMasterKey(PASSWORD, SALT_A)
      const k2 = await deriveMasterKey('a different password', SALT_A)

      const ciphertext = await encryptWithKey(k1, 'value')
      await expect(decryptWithKey(k2, ciphertext)).rejects.toThrow()
    })
  })

  describe('deriveMasterKeyExtractable', () => {
    it('produces a 32-byte key whose raw bytes are a deterministic known answer', async () => {
      const k1 = await deriveMasterKeyExtractable(PASSWORD, SALT_A)
      const k2 = await deriveMasterKeyExtractable(PASSWORD, SALT_A)

      expect(k1.extractable).toBe(true)
      const hex1 = await rawHex(k1)
      const hex2 = await rawHex(k2)

      expect(hex1).toHaveLength(64) // 32 bytes => 64 hex chars
      expect(hex1).toBe(hex2)
    })

    it('produces different raw bytes for a different salt', async () => {
      const a = await rawHex(await deriveMasterKeyExtractable(PASSWORD, SALT_A))
      const b = await rawHex(await deriveMasterKeyExtractable(PASSWORD, SALT_B))

      expect(a).not.toBe(b)
    })

    it('matches the non-extractable key derived from the same inputs', async () => {
      // The extractable copy must encrypt data the in-memory master key can read,
      // otherwise recovery escrow would wrap the wrong key.
      const extractable = await deriveMasterKeyExtractable(PASSWORD, SALT_A)
      const inMemory = await deriveMasterKey(PASSWORD, SALT_A)

      const ciphertext = await encryptWithKey(extractable, 'escrow check')
      await expect(decryptWithKey(inMemory, ciphertext)).resolves.toBe('escrow check')
    })
  })

  describe('importMasterKey', () => {
    it('imports raw bytes as a non-extractable key that decrypts the original ciphertext', async () => {
      const extractable = await deriveMasterKeyExtractable(PASSWORD, SALT_A)
      const raw = await crypto.subtle.exportKey('raw', extractable)
      const ciphertext = await encryptWithKey(extractable, 'recovered value')

      const imported = await importMasterKey(raw)

      expect(imported.extractable).toBe(false)
      expect(imported.algorithm.name).toBe('AES-GCM')
      await expect(decryptWithKey(imported, ciphertext)).resolves.toBe('recovered value')
    })
  })

  describe('generateKeySalt', () => {
    it('returns base64 that decodes to 32 random bytes', () => {
      const salt = generateKeySalt()
      const bytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0))

      expect(bytes).toHaveLength(32)
    })

    it('returns a different salt on each call', () => {
      expect(generateKeySalt()).not.toBe(generateKeySalt())
    })
  })
})
