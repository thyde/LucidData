/**
 * LD-401 registry.
 *
 * Formats are looked up by identifier and version, and an unknown pair fails
 * closed rather than falling back to a default. That matters more than it
 * sounds: a verifier that guesses a format when the declared one is missing can
 * be steered into checking a credential under weaker rules than the issuer
 * applied.
 *
 * Nothing here infers a format from the shape of the bytes, for the same
 * reason. The format is declared or the credential is refused.
 */

import { CredentialFormatError, type CredentialFormat, type FormatVersion } from './types'
import { sdJwtVcFormat } from './sd-jwt-vc'
import { w3cVc2Format } from './w3c-vc2'
import { lucidEd25519Format } from './lucid-ed25519'

export const CREDENTIAL_FORMATS: CredentialFormat[] = [
  lucidEd25519Format,
  w3cVc2Format,
  sdJwtVcFormat,
]

/** The format issued when a caller does not ask for one, keeping existing behaviour. */
export const DEFAULT_FORMAT: FormatVersion = {
  format: lucidEd25519Format.format,
  version: lucidEd25519Format.version,
}

function key(format: string, version: string): string {
  return `${format}@${version}`
}

const BY_KEY = new Map(
  CREDENTIAL_FORMATS.map((entry) => [key(entry.format, entry.version), entry])
)

/**
 * Resolve a format, or throw.
 *
 * Throws rather than returning null so a caller cannot accidentally continue
 * with an undefined format. Fail closed is the whole point of this lookup.
 */
export function getFormat(format: string, version?: string): CredentialFormat {
  if (!format) throw new CredentialFormatError('No credential format was declared')

  if (version) {
    const exact = BY_KEY.get(key(format, version))
    if (!exact) {
      throw new CredentialFormatError(`Unsupported credential format: ${format}@${version}`)
    }
    return exact
  }

  // Without a version, only resolve when there is exactly one. Two versions of
  // one format is precisely the ambiguity that must not be guessed at.
  const candidates = CREDENTIAL_FORMATS.filter((entry) => entry.format === format)
  if (candidates.length === 0) {
    throw new CredentialFormatError(`Unsupported credential format: ${format}`)
  }
  if (candidates.length > 1) {
    throw new CredentialFormatError(
      `Ambiguous credential format: ${format} has ${candidates.length} versions, so a version must be given`
    )
  }
  return candidates[0]
}

/** Whether a format and version are supported, without throwing. */
export function isSupportedFormat(format: string, version?: string): boolean {
  try {
    getFormat(format, version)
    return true
  } catch {
    return false
  }
}

/** Every format, for the trust centre and the issuer UI. */
export function describeFormats(): {
  format: string
  version: string
  label: string
  description: string
}[] {
  return CREDENTIAL_FORMATS.map((entry) => ({
    format: entry.format,
    version: entry.version,
    label: entry.label,
    description: entry.describe(),
  }))
}

export * from './types'
export { sdJwtVcFormat, presentSubset, disclosableClaimCount } from './sd-jwt-vc'
export { w3cVc2Format } from './w3c-vc2'
export { lucidEd25519Format } from './lucid-ed25519'
