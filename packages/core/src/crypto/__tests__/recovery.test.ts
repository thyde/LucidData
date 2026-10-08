import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  deriveRecoveryKey,
  findMasterKeyWithRecoverySecret,
  generateRecoveryCode,
  generateRecoveryKitSecret,
  generateRecoverySalt,
  normalizeRecoveryCode,
  openMasterKeyWithRecoverySecret,
  opensDataKey,
  recoverySecretKind,
  unwrapMasterKeyForRecovery,
  wrapMasterKeyForRecovery,
} from '../recovery'
import { deriveMasterKey } from '../key-derivation'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

// Known-answer vectors for LD-105 recovery.
//
// The master key and the wrapped data key are the pinned envelope from
// vectors.test.ts, so a key recovered here is checked against a vault entry made
// outside this codebase. The wrapped copies below were produced with node:crypto
// (pbkdf2Sync and an aes-256-gcm cipher), not with Web Crypto and not by running
// this code: they check the implementation rather than restate it. The secrets
// are examples and protect nothing.
const MASTER_KEY_HEX = '5df6aff100470456c8d603ade50c344ace2f3db43ef4d82a53102aacf01192ed'
const VAULT = {
  password: 'correct horse battery staple',
  saltB64: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=',
}
const PROBE = {
  encrypted_dek: 'UonTEwnxpyc5rtXikFyR1NliaGGbPBa7BKUIEXNNTiBGxGBWgn7y0LVOtMPIAdRR',
  dek_salt: 'oKGio6Slpqeoqaqr',
}
const CODE = {
  secret: 'A1B2C-D3E4F-G5H6J-K7M8N-P9Q0R',
  salt: 'Q0NDQ0NDQ0NDQ0NDQ0NDQw==',
  wrapped:
    'AAECAwQFBgcICQoLtORd3JtX3cPbNZPHgN0H5Tf1+e/6GJQsgGPhbFZn0ftDD2sxj5JeY8V66Oe55E/KwzLB5e5P9WAZaoAr',
}
const KIT = {
  secret: 'ABCDEFGH-JKMNPQRS-TVWXYZ01-23456789',
  salt: 'S0tLS0tLS0tLS0tLS0tLSw==',
  wrapped:
    'EBESExQVFhcYGRobz7yZgHfg0aGDrpeh0G6wKRhUNC8/+g4SDasojZLzgpe7wKv/6oGfDjG3fir0eE8J3/aSxghH9lpSZUnI',
}

const codeCopy = { wrapped: CODE.wrapped, salt: CODE.salt }
const kitCopy = { wrapped: KIT.wrapped, salt: KIT.salt }

function hex(buffer: ArrayBuffer | null): string | null {
  return buffer ? Buffer.from(new Uint8Array(buffer)).toString('hex') : null
}

/** A copy of some other master key under the given secret, as a password change leaves behind. */
async function staleCopy(secret: string) {
  const otherKey = webcrypto.getRandomValues(new Uint8Array(32)).buffer
  const salt = generateRecoverySalt()
  return { wrapped: await wrapMasterKeyForRecovery(otherKey, await deriveRecoveryKey(secret, salt)), salt }
}

describe('recovery secrets', () => {
  it('formats a recovery code as five groups of five from the unambiguous alphabet', () => {
    const code = generateRecoveryCode()

    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
    expect(generateRecoveryCode()).not.toBe(code)
  })

  it('formats a kit secret as four groups of eight', () => {
    expect(generateRecoveryKitSecret()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}(-[0-9A-HJKMNP-TV-Z]{8}){3}$/)
  })

  it('forgives case, spacing, and letters that look like digits', () => {
    expect(normalizeRecoveryCode(' a1b2c d3e4f-g5h6j\nk7m8n p9qOr ')).toBe('A1B2CD3E4FG5H6JK7M8NP9Q0R')
    expect(normalizeRecoveryCode('il-IL')).toBe('1111')
  })

  it('tells a recovery code from a kit secret by its length', () => {
    expect(recoverySecretKind(CODE.secret)).toBe('recovery_code')
    expect(recoverySecretKind(CODE.secret.toLowerCase().replace(/-/g, ' '))).toBe('recovery_code')
    expect(recoverySecretKind(KIT.secret)).toBe('recovery_kit')
    expect(recoverySecretKind(generateRecoveryCode())).toBe('recovery_code')
    expect(recoverySecretKind(generateRecoveryKitSecret())).toBe('recovery_kit')
    expect(recoverySecretKind('A1B2C-D3E4F')).toBeNull()
    expect(recoverySecretKind('')).toBeNull()
  })
})

describe('recovery known-answer vectors', () => {
  it('opens the master key wrapped outside this codebase with a recovery code', async () => {
    const raw = await openMasterKeyWithRecoverySecret(CODE.secret.toLowerCase(), [codeCopy], PROBE)

    expect(hex(raw)).toBe(MASTER_KEY_HEX)
  })

  it('opens it with a kit secret', async () => {
    const raw = await openMasterKeyWithRecoverySecret(KIT.secret, [kitCopy], PROBE)

    expect(hex(raw)).toBe(MASTER_KEY_HEX)
  })

  it('opens the pinned vault entry with the key it recovers', async () => {
    const raw = await unwrapMasterKeyForRecovery(CODE.wrapped, await deriveRecoveryKey(CODE.secret, CODE.salt))

    expect(await opensDataKey(raw, PROBE)).toBe(true)
  })

  it('refuses a secret that belongs to a different copy', async () => {
    expect(await openMasterKeyWithRecoverySecret(KIT.secret, [codeCopy])).toBeNull()
  })
})

describe('opening the vault with a recovery secret', () => {
  it('round trips a new code through wrap and open', async () => {
    const raw = webcrypto.getRandomValues(new Uint8Array(32))
    const code = generateRecoveryCode()
    const salt = generateRecoverySalt()
    const wrapped = await wrapMasterKeyForRecovery(raw.buffer, await deriveRecoveryKey(code, salt))

    const opened = await openMasterKeyWithRecoverySecret(code, [{ wrapped, salt }])

    expect(new Uint8Array(opened!)).toEqual(raw)
    expect(wrapped).not.toContain(Buffer.from(raw).toString('base64'))
  })

  it('finds the copy a secret belongs to among several, and tries each copy once', async () => {
    const raw = await openMasterKeyWithRecoverySecret(KIT.secret, [codeCopy, codeCopy, kitCopy], PROBE)

    expect(hex(raw)).toBe(MASTER_KEY_HEX)
  })

  it('skips a copy that opens but no longer matches the vault', async () => {
    const stale = await staleCopy(CODE.secret)

    expect(hex(await openMasterKeyWithRecoverySecret(CODE.secret, [stale, codeCopy], PROBE))).toBe(
      MASTER_KEY_HEX
    )
    expect(await openMasterKeyWithRecoverySecret(CODE.secret, [stale], PROBE)).toBeNull()
    // With no entries there is nothing a stale key could fail to open, so it is accepted.
    expect(await openMasterKeyWithRecoverySecret(CODE.secret, [stale])).not.toBeNull()
  })

  it('refuses a tampered copy', async () => {
    const bytes = Buffer.from(CODE.wrapped, 'base64')
    bytes[20] ^= 0x01
    const tampered = { wrapped: bytes.toString('base64'), salt: CODE.salt }

    expect(await openMasterKeyWithRecoverySecret(CODE.secret, [tampered], PROBE)).toBeNull()
  })

  it('lets the caller decide which opened copy is current', async () => {
    const rejectAll = async () => false

    expect(await findMasterKeyWithRecoverySecret(CODE.secret, [codeCopy], rejectAll)).toBeNull()
    expect(hex(await findMasterKeyWithRecoverySecret(CODE.secret, [codeCopy]))).toBe(MASTER_KEY_HEX)
  })

  it('refuses a copy whose salt is not base64 instead of throwing', async () => {
    expect(
      await openMasterKeyWithRecoverySecret(CODE.secret, [{ wrapped: CODE.wrapped, salt: '***' }])
    ).toBeNull()
  })
})

describe('checking a key against the vault', () => {
  it('accepts the current master key as a CryptoKey', async () => {
    const key = await deriveMasterKey(VAULT.password, VAULT.saltB64)

    expect(await opensDataKey(key, PROBE)).toBe(true)
  })

  it('rejects any other key', async () => {
    const key = await deriveMasterKey('not the password', VAULT.saltB64)

    expect(await opensDataKey(key, PROBE)).toBe(false)
    expect(await opensDataKey(new Uint8Array(32).buffer, PROBE)).toBe(false)
  })
})
