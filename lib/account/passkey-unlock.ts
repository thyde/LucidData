'use client'

import { bufferToBase64URLString, startAuthentication } from '@simplewebauthn/browser'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import {
  derivePasskeyWrappingKey,
  generatePasskeySalt,
  passkeyPrfInput,
  unwrapMasterKeyForPasskey,
  wrapMasterKeyForPasskey,
} from '@luciddata/core/crypto/passkey-unlock'
import { deriveMasterKeyExtractable, importMasterKey } from '@luciddata/core/crypto/key-derivation'
import { vaultHasContent, vaultOpensWith } from '@/lib/account/account-crypto'
import { addPasskeyUnlockAction, getPasskeyUnlockMaterialAction } from '@/lib/actions/recovery.actions'
import { unwrap } from '@/lib/actions/unwrap'
import type { PasskeyUnlockMaterial } from '@/lib/services/recovery-factor.service'

/**
 * LD-112 in the browser. A passkey's PRF output opens a copy of the master key
 * the device wrapped with it. The output exists only here: every response that
 * goes to the server has it removed first.
 */

type PrfInputs = Record<string, { first: Uint8Array }>

/** The PRF extension's result on a ceremony, when the authenticator gave one. */
interface PrfResult {
  enabled?: boolean
  results?: { first?: ArrayBuffer | ArrayBufferView }
}

/** Sign-in options that also ask each passkey that can open the vault for its PRF output. */
export function withPrfInputs(
  options: PublicKeyCredentialRequestOptionsJSON,
  salts: Record<string, string>
): PublicKeyCredentialRequestOptionsJSON {
  const evalByCredential: PrfInputs = {}
  for (const [credentialId, salt] of Object.entries(salts)) evalByCredential[credentialId] = { first: passkeyPrfInput(salt) }
  if (Object.keys(evalByCredential).length === 0) return options
  // The binary input travels as it is; the library hands extensions to the browser unchanged.
  return { ...options, extensions: { ...options.extensions, prf: { evalByCredential } } as never }
}

/**
 * Split a ceremony's PRF output from its response. The response that is sent
 * to the server never carries the output, which is the secret that opens the
 * vault.
 */
export function takePrfOutput(response: AuthenticationResponseJSON): {
  output: ArrayBuffer | null
  response: AuthenticationResponseJSON
} {
  const { prf, ...rest } = (response.clientExtensionResults ?? {}) as Record<string, unknown> & { prf?: PrfResult }
  const first = prf?.results?.first
  const output = first ? (ArrayBuffer.isView(first) ? first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength) : first) : null
  return { output: output as ArrayBuffer | null, response: { ...response, clientExtensionResults: rest } }
}

/** Whether a key fits the vault as it is now. True for a vault with nothing to check it against. */
async function fitsVault(key: CryptoKey, material: PasskeyUnlockMaterial): Promise<boolean> {
  return !vaultHasContent(material) || vaultOpensWith(key, material)
}

/**
 * Open the vault with a passkey's PRF output: unwrap that passkey's copy of
 * the master key and keep it only if it opens the newest entry. Null when the
 * passkey has no copy or the copy no longer fits the vault.
 */
export async function openVaultWithPasskey(
  credentialId: string,
  prfOutput: ArrayBuffer,
  material: PasskeyUnlockMaterial
): Promise<CryptoKey | null> {
  const copy = material.passkeys.find((passkey) => passkey.credentialId === credentialId)
  if (!copy) return null
  try {
    const raw = await unwrapMasterKeyForPasskey(copy.wrappedMasterKey, await derivePasskeyWrappingKey(prfOutput, copy.salt))
    const key = await importMasterKey(raw)
    return (await fitsVault(key, material)) ? key : null
  } catch {
    return null
  }
}

/** Options for a ceremony the browser runs on its own, to read a PRF output rather than to sign in. */
function localCeremony(credentialIds: string[], salts: Record<string, string>): PublicKeyCredentialRequestOptionsJSON {
  return withPrfInputs(
    {
      // Nothing checks this challenge: the PRF output is the proof, since only
      // the passkey can produce it and only it opens the wrapped key.
      challenge: bufferToBase64URLString(crypto.getRandomValues(new Uint8Array(32)).buffer),
      rpId: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
      allowCredentials: credentialIds.map((id) => ({ id, type: 'public-key' })),
      userVerification: 'required',
      timeout: 60_000,
    },
    salts
  )
}

/**
 * Open a signed-in vault with any passkey that can, as after a reload, which
 * clears the key from memory. Null when no passkey can, or the person cancels.
 * Material read beforehand lets the passkey prompt open with nothing awaited
 * first, which older Safari needs to treat the click as the prompt's cause.
 */
export async function unlockWithPasskey(preloaded?: PasskeyUnlockMaterial): Promise<CryptoKey | null> {
  const material = preloaded ?? (await unwrap(getPasskeyUnlockMaterialAction()))
  if (material.passkeys.length === 0) return null
  const salts = Object.fromEntries(material.passkeys.map((passkey) => [passkey.credentialId, passkey.salt]))
  const response = await startAuthentication({ optionsJSON: localCeremony(Object.keys(salts), salts) })
  const { output } = takePrfOutput(response)
  if (!output) return null
  return openVaultWithPasskey(response.id, output, material)
}

/**
 * Let one passkey open the vault. Runs a ceremony for that passkey with a
 * fresh PRF input, wraps the master key the password derives under the
 * output, and stores the wrapped copy. Returns false when the passkey or the
 * browser cannot produce a PRF output, which leaves nothing stored.
 */
export async function enablePasskeyUnlock(input: {
  passkeyId: string
  credentialId: string
  password: string
  keySalt: string
  stepUpToken: string
}): Promise<boolean> {
  // A copy is only worth making of the key the vault is under now. After a
  // reset that did not restore the vault, the password makes a different one.
  const extractable = await deriveMasterKeyExtractable(input.password, input.keySalt)
  const raw = await crypto.subtle.exportKey('raw', extractable)
  if (!(await fitsVault(await importMasterKey(raw), await unwrap(getPasskeyUnlockMaterialAction())))) {
    throw new Error(
      'Your password does not open your vault as it is now, so this passkey cannot either. If you reset your password, restore your vault with your recovery code or kit first.'
    )
  }

  const salt = generatePasskeySalt()
  const response = await startAuthentication({
    optionsJSON: localCeremony([input.credentialId], { [input.credentialId]: salt }),
  })
  const { output } = takePrfOutput(response)
  if (!output || response.id !== input.credentialId) return false

  const wrapped = await wrapMasterKeyForPasskey(raw, await derivePasskeyWrappingKey(output, salt))
  await unwrap(
    addPasskeyUnlockAction({
      passkeyId: input.passkeyId,
      wrappedMasterKey: wrapped,
      salt,
      stepUpToken: input.stepUpToken,
    })
  )
  return true
}
