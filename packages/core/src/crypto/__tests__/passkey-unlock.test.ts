import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  derivePasskeyWrappingBits,
  derivePasskeyWrappingKey,
  generatePasskeySalt,
  passkeyPrfInput,
  PASSKEY_SALT_BYTES,
  unwrapMasterKeyForPasskey,
  wrapMasterKeyForPasskey,
} from '../passkey-unlock'
import { base64ToBytes } from '../runtime'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

// Known-answer vectors for LD-112.
//
// The PRF output is the bytes 0 to 31 and the factor's salt the bytes 32 to
// 63. The expected HKDF output was computed with Python's hmac module, and
// node:crypto's hkdfSync agrees with it. The wrapped master key was produced
// with node:crypto's aes-256-gcm cipher and a fixed IV, not with Web Crypto
// and not by running this code. The master key is the pinned one from
// vectors.test.ts. Nothing here protects anything real.
const PRF_OUTPUT = Uint8Array.from({ length: 32 }, (_, index) => index)
const SALT = 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8='
const WRAPPING_BITS_HEX = '9fecfd9ea342ef45b0d4d3096c69d8762413a96acf63241cf228faf7a2078b91'
const MASTER_KEY_HEX = '5df6aff100470456c8d603ade50c344ace2f3db43ef4d82a53102aacf01192ed'
const WRAPPED = 'oKGio6SlpqeoqaqrWeWNsUe3eTAj91vQGfDPjKP17K0YTVAMMJeHPTxrvrFTKZKEvHuxOlwHamlvRBniwPhNNgFwiK5f24Bg'

const hex = (buffer: ArrayBuffer) => Buffer.from(buffer).toString('hex')
const fromHex = (text: string) => Uint8Array.from(Buffer.from(text, 'hex')).buffer

describe('passkey unlock', () => {
  it('derives the wrapping key computed outside this codebase', async () => {
    expect(hex(await derivePasskeyWrappingBits(PRF_OUTPUT, SALT))).toBe(WRAPPING_BITS_HEX)
  })

  it('opens a master key wrapped outside this codebase', async () => {
    const key = await derivePasskeyWrappingKey(PRF_OUTPUT, SALT)
    expect(hex(await unwrapMasterKeyForPasskey(WRAPPED, key))).toBe(MASTER_KEY_HEX)
  })

  it('round-trips the master key under a fresh salt', async () => {
    const salt = generatePasskeySalt()
    const key = await derivePasskeyWrappingKey(PRF_OUTPUT, salt)
    const wrapped = await wrapMasterKeyForPasskey(fromHex(MASTER_KEY_HEX), key)

    expect(hex(await unwrapMasterKeyForPasskey(wrapped, key))).toBe(MASTER_KEY_HEX)
    // A fresh IV each time, so two wraps of the same key differ.
    expect(await wrapMasterKeyForPasskey(fromHex(MASTER_KEY_HEX), key)).not.toBe(wrapped)
  })

  it('refuses to open with a wrong PRF output', async () => {
    const wrong = PRF_OUTPUT.map((byte, index) => (index === 0 ? byte ^ 1 : byte))
    const key = await derivePasskeyWrappingKey(wrong, SALT)
    await expect(unwrapMasterKeyForPasskey(WRAPPED, key)).rejects.toThrow()
  })

  it('refuses to open with the right output under another salt', async () => {
    const key = await derivePasskeyWrappingKey(PRF_OUTPUT, generatePasskeySalt())
    await expect(unwrapMasterKeyForPasskey(WRAPPED, key)).rejects.toThrow()
  })

  it('refuses a PRF output too short to be one', async () => {
    await expect(derivePasskeyWrappingBits(PRF_OUTPUT.slice(0, 16), SALT)).rejects.toThrow('32 bytes')
  })

  it('makes a 32-byte salt that is also the PRF input', () => {
    const salt = generatePasskeySalt()
    expect(base64ToBytes(salt)).toHaveLength(PASSKEY_SALT_BYTES)
    expect(Array.from(passkeyPrfInput(salt))).toEqual(Array.from(base64ToBytes(salt)))
    expect(generatePasskeySalt()).not.toBe(salt)
  })
})
