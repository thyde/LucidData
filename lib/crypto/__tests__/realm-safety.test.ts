import { describe, it, expect, afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { deriveMasterKey, deriveMasterKeyExtractable, importMasterKey } from '../key-derivation'
import { encryptVaultEntry, decryptVaultEntry, rewrapDek } from '../client-crypto'
import { generateIngestionKeypair, sealToPublicKey, openSealed } from '../ingestion-keys'
import { asBytes } from '../runtime'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

/**
 * Reproduce the argument check that broke CI.
 *
 * Web Crypto accepts a bare ArrayBuffer in the specification, so this looks
 * pedantic. It is not. Node 20 validates that argument with a realm-sensitive
 * check, and every runtime this vault has to work on supplies buffers from a
 * different realm than the crypto implementation: jsdom in these tests, and the
 * page realm against a native implementation in React Native.
 *
 * The result was a suite that passed on Node 25 and failed on Node 20 with
 * "not instance of ArrayBuffer", which is an unhelpful thing to learn from CI
 * rather than from a test. Wrapping SubtleCrypto to refuse bare ArrayBuffers
 * makes the same defect fail everywhere, on any Node version.
 */
function realmStrictSubtle(real: SubtleCrypto): SubtleCrypto {
  const reject = (value: unknown, where: string) => {
    if (value instanceof ArrayBuffer) {
      throw new TypeError(
        `${where} received a bare ArrayBuffer. Pass a typed-array view: a bare ` +
          `buffer fails Node 20's realm-sensitive check.`
      )
    }
  }

  const algorithmBuffers = (algorithm: unknown, where: string) => {
    if (!algorithm || typeof algorithm !== 'object') return
    const a = algorithm as Record<string, unknown>
    reject(a.iv, `${where} algorithm.iv`)
    reject(a.salt, `${where} algorithm.salt`)
    reject(a.info, `${where} algorithm.info`)
  }

  // A Proxy rather than a spread, because SubtleCrypto's methods live on its
  // prototype and a spread would silently drop every one of them.
  return new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      const call = value.bind(target) as (...args: unknown[]) => unknown

      switch (prop) {
        case 'importKey':
          return (...args: unknown[]) => {
            reject(args[1], 'importKey')
            return call(...args)
          }
        case 'encrypt':
        case 'decrypt':
          return (...args: unknown[]) => {
            algorithmBuffers(args[0], String(prop))
            reject(args[2], `${String(prop)} data`)
            return call(...args)
          }
        case 'deriveKey':
        case 'deriveBits':
          return (...args: unknown[]) => {
            algorithmBuffers(args[0], String(prop))
            return call(...args)
          }
        case 'sign':
          return (...args: unknown[]) => {
            reject(args[2], 'sign data')
            return call(...args)
          }
        case 'verify':
          return (...args: unknown[]) => {
            reject(args[2], 'verify signature')
            reject(args[3], 'verify data')
            return call(...args)
          }
        default:
          return call
      }
    },
  }) as SubtleCrypto
}

const realSubtle = globalThis.crypto.subtle

function useStrictSubtle() {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: realmStrictSubtle(realSubtle),
    configurable: true,
  })
}

afterEach(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: realSubtle,
    configurable: true,
  })
})

const PASSWORD = 'correct horse battery staple'
const SALT = btoa('A'.repeat(32))

describe('crypto works when buffers and the implementation are in different realms', () => {
  it('derives a master key', async () => {
    useStrictSubtle()

    await expect(deriveMasterKey(PASSWORD, SALT)).resolves.toBeDefined()
  })

  it('encrypts and decrypts a vault entry', async () => {
    useStrictSubtle()
    const key = await deriveMasterKey(PASSWORD, SALT)

    const sealed = await encryptVaultEntry(key, 'the quick brown fox')
    const opened = await decryptVaultEntry(
      key,
      sealed.client_ciphertext,
      sealed.encrypted_dek,
      sealed.dek_salt
    )

    expect(opened).toBe('the quick brown fox')
  })

  it('re-wraps a data key onto a new master key', async () => {
    useStrictSubtle()
    const oldKey = await deriveMasterKey(PASSWORD, SALT)
    const newKey = await deriveMasterKey('a different password', SALT)
    const sealed = await encryptVaultEntry(oldKey, 'payload')

    const rewrapped = await rewrapDek(oldKey, newKey, sealed.encrypted_dek, sealed.dek_salt)
    const opened = await decryptVaultEntry(
      newKey,
      sealed.client_ciphertext,
      rewrapped.encrypted_dek,
      rewrapped.dek_salt
    )

    expect(opened).toBe('payload')
  })

  it('imports raw master-key bytes recovered from escrow', async () => {
    const extractable = await deriveMasterKeyExtractable(PASSWORD, SALT)
    const raw = await realSubtle.exportKey('raw', extractable)
    useStrictSubtle()

    await expect(importMasterKey(raw)).resolves.toBeDefined()
  })

  it('seals a connector payload and opens it again', async () => {
    // The sealed box is the path CI failed on first, because every one of its
    // key imports took a bare buffer.
    const pair = await generateIngestionKeypair()
    useStrictSubtle()

    const sealed = await sealToPublicKey(pair.publicKeyB64, 'a provider record')

    expect(await openSealed(pair.privateKeyB64, sealed)).toBe('a provider record')
  })
})

describe('the strict wrapper actually catches the defect', () => {
  // A guard that cannot fail is not a guard. This proves the wrapper above
  // rejects what Node 20 rejected, so the tests using it mean something.
  it('rejects a bare ArrayBuffer passed to importKey', () => {
    useStrictSubtle()
    const raw = new ArrayBuffer(32)

    expect(() =>
      globalThis.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt'])
    ).toThrow(/bare ArrayBuffer/)
  })

  it('accepts the view asBytes produces', async () => {
    useStrictSubtle()
    const raw = new ArrayBuffer(32)

    await expect(
      globalThis.crypto.subtle.importKey('raw', asBytes(raw), { name: 'AES-GCM' }, false, [
        'encrypt',
      ])
    ).resolves.toBeDefined()
  })
})

describe('asBytes', () => {
  it('returns a view over the same bytes for a buffer', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer

    const view = asBytes(buffer)

    expect(ArrayBuffer.isView(view)).toBe(true)
    expect(Array.from(view)).toEqual([1, 2, 3])
  })

  it('preserves the window of an offset view rather than the whole buffer', () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5])
    const middle = backing.subarray(1, 4)

    const view = asBytes(middle)

    expect(Array.from(view)).toEqual([2, 3, 4])
  })
})
