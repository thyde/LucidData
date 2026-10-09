import { describe, it, expect, beforeEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const startAuthentication = vi.fn()
const getPasskeyUnlockMaterialAction = vi.fn()
const addPasskeyUnlockAction = vi.fn()

vi.mock('@simplewebauthn/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
}))
vi.mock('@/lib/actions/recovery.actions', () => ({
  getPasskeyUnlockMaterialAction: (...args: unknown[]) => getPasskeyUnlockMaterialAction(...args),
  addPasskeyUnlockAction: (...args: unknown[]) => addPasskeyUnlockAction(...args),
  addRecoveryFactorAction: vi.fn(),
}))
vi.mock('@/lib/actions/account.actions', () => ({}))
vi.mock('@/lib/actions/legal.actions', () => ({}))
vi.mock('@/lib/actions/connector.actions', () => ({}))

const { enablePasskeyUnlock, openVaultWithPasskey, takePrfOutput, unlockWithPasskey, withPrfInputs } = await import(
  '@/lib/account/passkey-unlock'
)
const { derivePasskeyWrappingKey, generatePasskeySalt, passkeyPrfInput, unwrapMasterKeyForPasskey, wrapMasterKeyForPasskey } =
  await import('@luciddata/core/crypto/passkey-unlock')
const { deriveMasterKeyExtractable, generateKeySalt, importMasterKey } = await import('@luciddata/core/crypto/key-derivation')
const { encryptVaultEntry, encryptWithKey } = await import('@luciddata/core/crypto/client-crypto')

function bytes(length: number, start = 0): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  for (let index = 0; index < length; index++) out[index] = (start + index) % 256
  return out
}

/** A vault key as raw bytes and as the key the page would hold. */
async function vaultKey() {
  const raw = webcrypto.getRandomValues(new Uint8Array(32))
  return { raw: raw.buffer as ArrayBuffer, key: await importMasterKey(raw.buffer as ArrayBuffer) }
}

/** One passkey's copy of a vault key, as the server would return it. */
async function copyFor(credentialId: string, raw: ArrayBuffer, prfOutput: Uint8Array<ArrayBuffer>) {
  const salt = generatePasskeySalt()
  return {
    credentialId,
    salt,
    wrappedMasterKey: await wrapMasterKeyForPasskey(raw, await derivePasskeyWrappingKey(prfOutput, salt)),
  }
}

/** An entry the vault key opens: its wrapped data key is what the probe checks. */
async function entryUnder(key: CryptoKey) {
  const { encrypted_dek, dek_salt } = await encryptVaultEntry(key, '{"kind":"note"}')
  return { encrypted_dek, dek_salt }
}

function assertion(id: string, clientExtensionResults: Record<string, unknown>): AuthenticationResponseJSON {
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: { authenticatorData: 'YQ', clientDataJSON: 'Yg', signature: 'Yw' },
    clientExtensionResults: clientExtensionResults as AuthenticationResponseJSON['clientExtensionResults'],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  addPasskeyUnlockAction.mockResolvedValue({ id: 'factor-1' })
})

describe('withPrfInputs', () => {
  it('asks each passkey that can open the vault for its output, with its own input', () => {
    const salt = generatePasskeySalt()
    const options = withPrfInputs(
      { challenge: 'Y2hhbGxlbmdl', allowCredentials: [{ id: 'cred-1', type: 'public-key' }] },
      { 'cred-1': salt }
    )

    const prf = (options.extensions as unknown as { prf: { evalByCredential: Record<string, { first: Uint8Array }> } }).prf
    expect(Object.keys(prf.evalByCredential)).toEqual(['cred-1'])
    expect(prf.evalByCredential['cred-1'].first).toEqual(passkeyPrfInput(salt))
    expect(options.challenge).toBe('Y2hhbGxlbmdl')
  })

  it('leaves the options alone when no passkey can open the vault', () => {
    const options = { challenge: 'Y2hhbGxlbmdl' }
    expect(withPrfInputs(options, {})).toBe(options)
  })
})

describe('takePrfOutput', () => {
  it('keeps the output in the page and sends the rest of the response on', () => {
    const output = bytes(32)
    const { output: taken, response } = takePrfOutput(
      assertion('cred-1', { prf: { results: { first: output.buffer } }, appid: false })
    )

    expect(new Uint8Array(taken!)).toEqual(output)
    expect(response.clientExtensionResults).toEqual({ appid: false })
    expect(JSON.stringify(response)).not.toContain('prf')
  })

  it('copies out only the viewed bytes of a typed array', () => {
    const backing = bytes(48)
    const { output } = takePrfOutput(assertion('cred-1', { prf: { results: { first: backing.subarray(8, 40) } } }))

    expect(new Uint8Array(output!)).toEqual(bytes(32, 8))
  })

  it('reports no output when the passkey gave none', () => {
    const { output, response } = takePrfOutput(assertion('cred-1', { prf: { enabled: false } }))

    expect(output).toBeNull()
    expect(response.clientExtensionResults).toEqual({})
  })
})

describe('openVaultWithPasskey', () => {
  it('opens the vault with the right output when the key fits the newest entry', async () => {
    const { raw, key } = await vaultKey()
    const output = bytes(32)
    const material = { passkeys: [await copyFor('cred-1', raw, output)], probe: await entryUnder(key), ingest_key: null }

    const opened = await openVaultWithPasskey('cred-1', output.buffer as ArrayBuffer, material)

    expect(opened).not.toBeNull()
    expect(opened!.extractable).toBe(false)
    // The key it returns opens what the vault key opens.
    const probe = await entryUnder(opened!)
    expect(await openVaultWithPasskey('cred-1', output.buffer as ArrayBuffer, { ...material, probe })).not.toBeNull()
  })

  it('refuses a wrong output', async () => {
    const { raw, key } = await vaultKey()
    const material = { passkeys: [await copyFor('cred-1', raw, bytes(32))], probe: await entryUnder(key), ingest_key: null }

    expect(await openVaultWithPasskey('cred-1', bytes(32, 1).buffer as ArrayBuffer, material)).toBeNull()
  })

  it('refuses a passkey that has no copy', async () => {
    const { raw } = await vaultKey()
    const material = { passkeys: [await copyFor('cred-1', raw, bytes(32))], probe: null, ingest_key: null }

    expect(await openVaultWithPasskey('cred-2', bytes(32).buffer as ArrayBuffer, material)).toBeNull()
  })

  it('refuses a copy of a key the vault is no longer under', async () => {
    const old = await vaultKey()
    const current = await vaultKey()
    const output = bytes(32)
    const material = {
      passkeys: [await copyFor('cred-1', old.raw, output)],
      probe: await entryUnder(current.key),
      ingest_key: null,
    }

    expect(await openVaultWithPasskey('cred-1', output.buffer as ArrayBuffer, material)).toBeNull()
  })

  it('checks against the connector key when the vault has no entries', async () => {
    const old = await vaultKey()
    const current = await vaultKey()
    const output = bytes(32)
    const ingest_key = { wrapped: await encryptWithKey(current.key, 'connector private key') }

    const stale = { passkeys: [await copyFor('cred-1', old.raw, output)], probe: null, ingest_key }
    expect(await openVaultWithPasskey('cred-1', output.buffer as ArrayBuffer, stale)).toBeNull()

    const fresh = { passkeys: [await copyFor('cred-1', current.raw, output)], probe: null, ingest_key }
    expect(await openVaultWithPasskey('cred-1', output.buffer as ArrayBuffer, fresh)).not.toBeNull()
  })
})

describe('unlockWithPasskey', () => {
  it('runs one ceremony for the passkeys that can open the vault and requires user verification', async () => {
    const { raw, key } = await vaultKey()
    const output = bytes(32)
    const copy = await copyFor('cred-1', raw, output)
    getPasskeyUnlockMaterialAction.mockResolvedValue({ passkeys: [copy], probe: await entryUnder(key), ingest_key: null })
    startAuthentication.mockResolvedValue(assertion('cred-1', { prf: { results: { first: output.buffer } } }))

    expect(await unlockWithPasskey()).not.toBeNull()

    const { optionsJSON } = startAuthentication.mock.calls[0][0]
    expect(optionsJSON.userVerification).toBe('required')
    expect(optionsJSON.allowCredentials).toEqual([{ id: 'cred-1', type: 'public-key' }])
    expect(Object.keys(optionsJSON.extensions.prf.evalByCredential)).toEqual(['cred-1'])
  })

  it('opens the prompt without a request first when the material was read beforehand', async () => {
    const { raw, key } = await vaultKey()
    const output = bytes(32)
    const material = { passkeys: [await copyFor('cred-1', raw, output)], probe: await entryUnder(key), ingest_key: null }
    startAuthentication.mockResolvedValue(assertion('cred-1', { prf: { results: { first: output.buffer } } }))

    expect(await unlockWithPasskey(material)).not.toBeNull()
    expect(getPasskeyUnlockMaterialAction).not.toHaveBeenCalled()
  })

  it('asks for nothing when no passkey can open the vault', async () => {
    getPasskeyUnlockMaterialAction.mockResolvedValue({ passkeys: [], probe: null, ingest_key: null })

    expect(await unlockWithPasskey()).toBeNull()
    expect(startAuthentication).not.toHaveBeenCalled()
  })

  it('gives nothing back when the authenticator has no PRF support', async () => {
    const { raw } = await vaultKey()
    getPasskeyUnlockMaterialAction.mockResolvedValue({
      passkeys: [await copyFor('cred-1', raw, bytes(32))],
      probe: null,
      ingest_key: null,
    })
    startAuthentication.mockResolvedValue(assertion('cred-1', {}))

    expect(await unlockWithPasskey()).toBeNull()
  })
})

describe('enablePasskeyUnlock', () => {
  const password = 'correct horse battery staple'

  it('stores a copy of the key the password makes, wrapped under the passkey output', async () => {
    const keySalt = generateKeySalt()
    const extractable = await deriveMasterKeyExtractable(password, keySalt)
    const raw = await webcrypto.subtle.exportKey('raw', extractable)
    getPasskeyUnlockMaterialAction.mockResolvedValue({
      passkeys: [],
      probe: await entryUnder(await importMasterKey(raw)),
      ingest_key: null,
    })
    const output = bytes(32, 100)
    startAuthentication.mockResolvedValue(assertion('cred-1', { prf: { results: { first: output.buffer } } }))

    expect(
      await enablePasskeyUnlock({ passkeyId: 'pk-1', credentialId: 'cred-1', password, keySalt, stepUpToken: 'grant' })
    ).toBe(true)

    const { optionsJSON } = startAuthentication.mock.calls[0][0]
    expect(optionsJSON.allowCredentials).toEqual([{ id: 'cred-1', type: 'public-key' }])
    const sent = addPasskeyUnlockAction.mock.calls[0][0]
    expect(sent).toMatchObject({ passkeyId: 'pk-1', stepUpToken: 'grant' })
    expect(JSON.stringify(sent)).not.toContain(password)
    // The PRF input sent to the authenticator is the one derived from the stored salt.
    expect(optionsJSON.extensions.prf.evalByCredential['cred-1'].first).toEqual(passkeyPrfInput(sent.salt))
    const opened = await unwrapMasterKeyForPasskey(sent.wrappedMasterKey, await derivePasskeyWrappingKey(output, sent.salt))
    expect(new Uint8Array(opened)).toEqual(new Uint8Array(raw))
  })

  it('stores nothing when the passkey cannot produce an output', async () => {
    const keySalt = generateKeySalt()
    getPasskeyUnlockMaterialAction.mockResolvedValue({ passkeys: [], probe: null, ingest_key: null })
    startAuthentication.mockResolvedValue(assertion('cred-1', { prf: { enabled: false } }))

    expect(
      await enablePasskeyUnlock({ passkeyId: 'pk-1', credentialId: 'cred-1', password, keySalt, stepUpToken: 'grant' })
    ).toBe(false)
    expect(addPasskeyUnlockAction).not.toHaveBeenCalled()
  })

  it('refuses a password that does not open the vault as it is now, before asking for the passkey', async () => {
    const keySalt = generateKeySalt()
    const other = await vaultKey()
    getPasskeyUnlockMaterialAction.mockResolvedValue({ passkeys: [], probe: await entryUnder(other.key), ingest_key: null })

    await expect(
      enablePasskeyUnlock({ passkeyId: 'pk-1', credentialId: 'cred-1', password, keySalt, stepUpToken: 'grant' })
    ).rejects.toThrow(/does not open your vault/)
    expect(startAuthentication).not.toHaveBeenCalled()
    expect(addPasskeyUnlockAction).not.toHaveBeenCalled()
  })
})
