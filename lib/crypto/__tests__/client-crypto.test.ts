import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encryptWithKey,
  decryptWithKey,
  generateDEK,
  exportDEK,
  importDEK,
  encryptVaultEntry,
  decryptVaultEntry,
  rewrapDek,
} from '../client-crypto'
import { deriveMasterKey } from '../key-derivation'

// The vault crypto relies on the Web Crypto API. Node exposes it globally, but
// fall back explicitly so the suite is portable across test environments/CI.
if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const PASSWORD = 'correct horse battery staple'
const SALT_A = btoa('A'.repeat(32))
const SALT_B = btoa('B'.repeat(32))

function flipLastByte(b64: string): string {
  const bytes = new Uint8Array(base64ToArrayBuffer(b64))
  bytes[bytes.length - 1] ^= 0xff
  return arrayBufferToBase64(bytes.buffer)
}

describe('client-crypto', () => {
  describe('base64 helpers', () => {
    it('round-trips arbitrary bytes', () => {
      const original = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64])
      const restored = new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(original.buffer)))

      expect(Array.from(restored)).toEqual(Array.from(original))
    })

    it('decodes a known base64 value', () => {
      const bytes = new Uint8Array(base64ToArrayBuffer(btoa('hello')))
      expect(new TextDecoder().decode(bytes)).toBe('hello')
    })
  })

  describe('encryptWithKey / decryptWithKey', () => {
    it('round-trips a plaintext string', async () => {
      const dek = await generateDEK()
      const ciphertext = await encryptWithKey(dek, 'top secret')

      await expect(decryptWithKey(dek, ciphertext)).resolves.toBe('top secret')
    })

    it('round-trips empty and unicode strings', async () => {
      const dek = await generateDEK()

      await expect(decryptWithKey(dek, await encryptWithKey(dek, ''))).resolves.toBe('')
      const unicode = '你好世界 🌍 مرحبا'
      await expect(decryptWithKey(dek, await encryptWithKey(dek, unicode))).resolves.toBe(unicode)
    })

    it('uses a fresh IV so identical plaintext yields different ciphertext', async () => {
      const dek = await generateDEK()
      const c1 = await encryptWithKey(dek, 'same input')
      const c2 = await encryptWithKey(dek, 'same input')

      expect(c1).not.toBe(c2)
      await expect(decryptWithKey(dek, c1)).resolves.toBe('same input')
      await expect(decryptWithKey(dek, c2)).resolves.toBe('same input')
    })

    it('rejects tampered ciphertext (GCM auth tag failure)', async () => {
      const dek = await generateDEK()
      const ciphertext = await encryptWithKey(dek, 'integrity matters')

      await expect(decryptWithKey(dek, flipLastByte(ciphertext))).rejects.toThrow()
    })

    it('rejects decryption with the wrong key', async () => {
      const dek1 = await generateDEK()
      const dek2 = await generateDEK()
      const ciphertext = await encryptWithKey(dek1, 'for key one only')

      await expect(decryptWithKey(dek2, ciphertext)).rejects.toThrow()
    })
  })

  describe('DEK export/import', () => {
    it('exports 32 raw bytes and re-imports a working key', async () => {
      const dek = await generateDEK()
      const ciphertext = await encryptWithKey(dek, 'wrapped data')

      const raw = await exportDEK(dek)
      expect(raw.byteLength).toBe(32)

      const imported = await importDEK(raw)
      await expect(decryptWithKey(imported, ciphertext)).resolves.toBe('wrapped data')
    })
  })

  describe('encryptVaultEntry / decryptVaultEntry', () => {
    it('returns three non-empty fields and round-trips the plaintext', async () => {
      const masterKey = await deriveMasterKey(PASSWORD, SALT_A)
      const entry = await encryptVaultEntry(masterKey, 'plaintext payload')

      expect(entry.client_ciphertext).toBeTruthy()
      expect(entry.encrypted_dek).toBeTruthy()
      expect(entry.dek_salt).toBeTruthy()

      const decrypted = await decryptVaultEntry(
        masterKey,
        entry.client_ciphertext,
        entry.encrypted_dek,
        entry.dek_salt,
      )
      expect(decrypted).toBe('plaintext payload')
    })

    it('uses a fresh DEK and IVs for every entry', async () => {
      const masterKey = await deriveMasterKey(PASSWORD, SALT_A)
      const a = await encryptVaultEntry(masterKey, 'same payload')
      const b = await encryptVaultEntry(masterKey, 'same payload')

      expect(a.client_ciphertext).not.toBe(b.client_ciphertext)
      expect(a.encrypted_dek).not.toBe(b.encrypted_dek)
      expect(a.dek_salt).not.toBe(b.dek_salt)
    })

    it('cannot be decrypted with a different master key', async () => {
      const masterKey = await deriveMasterKey(PASSWORD, SALT_A)
      const wrongKey = await deriveMasterKey(PASSWORD, SALT_B)
      const entry = await encryptVaultEntry(masterKey, 'private')

      await expect(
        decryptVaultEntry(wrongKey, entry.client_ciphertext, entry.encrypted_dek, entry.dek_salt),
      ).rejects.toThrow()
    })
  })

  describe('rewrapDek', () => {
    it('rewraps the DEK to a new master key without touching the ciphertext', async () => {
      const oldKey = await deriveMasterKey(PASSWORD, SALT_A)
      const newKey = await deriveMasterKey('new password', SALT_B)
      const entry = await encryptVaultEntry(oldKey, 'survives password change')

      const rewrapped = await rewrapDek(oldKey, newKey, entry.encrypted_dek, entry.dek_salt)

      // client_ciphertext is untouched and still decrypts under the new envelope
      const decrypted = await decryptVaultEntry(
        newKey,
        entry.client_ciphertext,
        rewrapped.encrypted_dek,
        rewrapped.dek_salt,
      )
      expect(decrypted).toBe('survives password change')
    })

    it('produces an envelope the old master key can no longer open', async () => {
      const oldKey = await deriveMasterKey(PASSWORD, SALT_A)
      const newKey = await deriveMasterKey('new password', SALT_B)
      const entry = await encryptVaultEntry(oldKey, 'value')

      const rewrapped = await rewrapDek(oldKey, newKey, entry.encrypted_dek, entry.dek_salt)

      await expect(
        decryptVaultEntry(oldKey, entry.client_ciphertext, rewrapped.encrypted_dek, rewrapped.dek_salt),
      ).rejects.toThrow()
    })
  })
})
