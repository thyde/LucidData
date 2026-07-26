/**
 * LD-401 SD-JWT VC format.
 *
 * The important format in this set, because it is the only one that supports
 * disclosing some claims and withholding the rest. LD-402 needs that to prove
 * "over 18" without a birth date, and LD-404 needs it because a doorstep check
 * should not require handing over a home address.
 *
 * The shape follows RFC 9901 (SD-JWT) with the VC profile still in draft, which
 * is why the version below is pinned and the registry keys on it. A draft that
 * changes should become a new version rather than a silent edit to this one.
 *
 * Structure, tilde-separated:
 *
 *   <issuer-signed JWT>~<disclosure>~<disclosure>~...~
 *
 * The JWT holds a digest of every disclosable claim in `_sd`, never the values.
 * A disclosure is base64url(JSON([salt, name, value])), and its digest is
 * base64url(SHA-256(that exact string)). The holder drops the disclosures they
 * do not want to reveal; the digests stay, so the issuer's single signature
 * still covers the whole set and the verifier can see that something was
 * withheld without learning what.
 *
 * The salt is what stops a verifier guessing a withheld value. Without it,
 * "was this claim `over_18: true`?" is answerable by hashing the guess.
 */

import crypto from 'crypto'
import {
  CredentialFormatError,
  type CredentialClaims,
  type CredentialFormat,
  type IssueRequest,
  type IssuedArtifact,
  type IssuerSigner,
  type VerifyOptions,
  type VerifyResult,
} from './types'

const FORMAT = 'sd-jwt-vc'
const VERSION = 'draft-09'
const SALT_BYTES = 16

function b64u(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function fromB64u(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

/** base64url(SHA-256(disclosure)), computed over the encoded string exactly. */
export function disclosureDigest(disclosure: string): string {
  return crypto.createHash('sha256').update(disclosure, 'ascii').digest('base64url')
}

/** Encode one selectively disclosable claim. */
export function makeDisclosure(name: string, value: unknown, salt?: string): string {
  const useSalt = salt ?? b64u(crypto.randomBytes(SALT_BYTES))
  return b64u(JSON.stringify([useSalt, name, value]))
}

function parseDisclosure(disclosure: string): { salt: string; name: string; value: unknown } {
  let decoded: unknown
  try {
    decoded = JSON.parse(fromB64u(disclosure).toString('utf8'))
  } catch {
    throw new CredentialFormatError('Disclosure is not valid base64url JSON')
  }
  if (!Array.isArray(decoded) || decoded.length !== 3 || typeof decoded[1] !== 'string') {
    throw new CredentialFormatError('Disclosure must be [salt, name, value]')
  }
  return { salt: String(decoded[0]), name: decoded[1], value: decoded[2] }
}

interface SdJwtPayload {
  iss: string
  sub: string
  vct: string
  iat: number
  exp?: number
  nbf?: number
  _sd: string[]
  _sd_alg: string
  jti: string
  /** Claims that are always visible, because withholding them makes no sense. */
  [key: string]: unknown
}

function issuerId(request: IssueRequest): string {
  return request.issuerDomain
    ? `did:web:${request.issuerDomain}`
    : `urn:lucid:org:${request.issuerOrgId}`
}

function encodeJwt(header: object, payload: object, signer: IssuerSigner): string {
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`
  const signature = signer.sign(Buffer.from(signingInput, 'ascii'))
  return `${signingInput}.${signature.toString('base64url')}`
}

export const sdJwtVcFormat: CredentialFormat = {
  format: FORMAT,
  version: VERSION,
  label: 'SD-JWT VC',

  describe() {
    return (
      'A credential the holder can present in part. Each claim is committed to ' +
      'by a salted digest, so the holder can reveal a subset and the issuer signature ' +
      'still covers the whole. Verifiable without contacting LucidData.'
    )
  },

  issue(request: IssueRequest, signer: IssuerSigner): IssuedArtifact {
    // Every claim is disclosable. The subject email is not a claim: it is the
    // subject identifier and withholding it would leave nothing to bind to.
    const disclosures = Object.entries(request.claims).map(([name, value]) =>
      makeDisclosure(name, value)
    )

    // Sorted so the order of digests reveals nothing about the order of claims.
    const digests = disclosures.map(disclosureDigest).sort()

    const payload: SdJwtPayload = {
      iss: issuerId(request),
      sub: request.subjectEmail,
      vct: request.schemaType,
      jti: `urn:uuid:${request.credentialId}`,
      iat: Math.floor(new Date(request.issuedAt).getTime() / 1000),
      _sd: digests,
      _sd_alg: 'sha-256',
      label: request.label,
      issuer_name: request.issuerName,
    }
    if (request.expiresAt) {
      payload.exp = Math.floor(new Date(request.expiresAt).getTime() / 1000)
    }

    const jwt = encodeJwt(
      { alg: 'EdDSA', typ: 'vc+sd-jwt', kid: signer.keyId },
      payload,
      signer
    )

    // The trailing tilde is required even with no disclosures, because it is
    // what separates the credential from an optional key-binding JWT.
    const serialized = [jwt, ...disclosures].join('~') + '~'

    return {
      serialized,
      document: { ...payload, disclosures },
      formatVersion: { format: FORMAT, version: VERSION },
      keyId: signer.keyId,
    }
  },

  verify(serialized: string, options: VerifyOptions): VerifyResult {
    const formatVersion = { format: FORMAT, version: VERSION }
    const reasons: string[] = []
    const warnings: string[] = []
    const fail = (reason: string): VerifyResult => ({
      valid: false,
      reasons: [reason],
      warnings,
      disclosed: {},
      formatVersion,
    })

    const parts = serialized.split('~')
    if (parts.length < 2) return fail('Not an SD-JWT: no disclosure separator')

    const jwt = parts[0]
    // A trailing empty segment is the separator before an absent key-binding
    // JWT, so it is expected rather than a disclosure.
    const disclosureParts = parts.slice(1).filter((part) => part !== '')

    const segments = jwt.split('.')
    if (segments.length !== 3) return fail('Issuer JWT is malformed')

    let header: { alg?: string; kid?: string; typ?: string }
    let payload: SdJwtPayload
    try {
      header = JSON.parse(fromB64u(segments[0]).toString('utf8'))
      payload = JSON.parse(fromB64u(segments[1]).toString('utf8'))
    } catch {
      return fail('Issuer JWT is not valid JSON')
    }

    // Fail closed on an algorithm we did not choose. Accepting whatever the
    // header names is how "alg: none" attacks work.
    if (header.alg !== 'EdDSA') return fail(`Unsupported signature algorithm: ${header.alg}`)
    if (payload._sd_alg && payload._sd_alg !== 'sha-256') {
      return fail(`Unsupported digest algorithm: ${payload._sd_alg}`)
    }

    // Select the key by the identifier in the credential, never by whichever
    // key happens to be current. Rotation must not invalidate history.
    const key = options.keys.find((candidate) => candidate.keyId === header.kid)
    if (!key) return fail('Signed by a key this verifier does not hold')

    let signatureValid = false
    try {
      const publicKey = crypto.createPublicKey({
        key: fromB64u(key.publicKeyB64.replace(/\+/g, '-').replace(/\//g, '_')),
        format: 'der',
        type: 'spki',
      })
      signatureValid = crypto.verify(
        null,
        Buffer.from(`${segments[0]}.${segments[1]}`, 'ascii'),
        publicKey,
        fromB64u(segments[2])
      )
    } catch {
      signatureValid = false
    }
    if (!signatureValid) return fail('Issuer signature does not verify')

    const now = options.now ?? new Date()
    const nowSeconds = Math.floor(now.getTime() / 1000)
    if (payload.exp !== undefined && nowSeconds >= payload.exp) {
      reasons.push('Credential has expired')
    }
    if (payload.nbf !== undefined && nowSeconds < payload.nbf) {
      reasons.push('Credential is not yet valid')
    }

    // Every disclosure presented must be one the issuer committed to. An extra
    // disclosure means someone added a claim after signing.
    const committed = new Set(payload._sd ?? [])
    const disclosed: CredentialClaims = {}
    const seenDigests = new Set<string>()

    for (const disclosure of disclosureParts) {
      let parsed: { name: string; value: unknown }
      try {
        parsed = parseDisclosure(disclosure)
      } catch (error) {
        return fail(error instanceof CredentialFormatError ? error.message : 'Bad disclosure')
      }

      const digest = disclosureDigest(disclosure)
      if (!committed.has(digest)) {
        return fail('A disclosed claim was not committed to by the issuer')
      }
      if (seenDigests.has(digest)) {
        return fail('The same claim was disclosed twice')
      }
      seenDigests.add(digest)
      disclosed[parsed.name] = parsed.value
    }

    if (options.expectedNonce !== undefined) {
      // No key-binding JWT is present, so there is nothing carrying the nonce.
      // Refusing here is the point: a verifier that asked for proof of freshness
      // must not be handed a presentation that could have been captured.
      reasons.push('Presentation carries no holder binding, so the nonce cannot be checked')
    }

    const withheld = committed.size - seenDigests.size
    if (withheld > 0) {
      warnings.push(`${withheld} claim${withheld === 1 ? ' was' : 's were'} withheld by the holder`)
    }

    return {
      valid: reasons.length === 0,
      reasons,
      warnings,
      disclosed,
      formatVersion,
    }
  },
}

/**
 * Drop every disclosure except the named claims.
 *
 * This is the holder's action, not the issuer's, and it needs no key: removing
 * a disclosure leaves the issuer's signature intact because the signature
 * covers the digests rather than the values.
 */
export function presentSubset(serialized: string, claimNames: string[]): string {
  const parts = serialized.split('~')
  if (parts.length < 2) throw new CredentialFormatError('Not an SD-JWT')

  const keep = new Set(claimNames)
  const jwt = parts[0]
  const kept = parts
    .slice(1)
    .filter((part) => part !== '')
    .filter((disclosure) => keep.has(parseDisclosure(disclosure).name))

  return [jwt, ...kept].join('~') + '~'
}

/** The claim names an artifact could disclose, without revealing the values. */
export function disclosableClaimCount(serialized: string): number {
  const parts = serialized.split('~')
  if (parts.length < 2) throw new CredentialFormatError('Not an SD-JWT')
  try {
    const payload = JSON.parse(fromB64u(parts[0].split('.')[1]).toString('utf8'))
    return Array.isArray(payload._sd) ? payload._sd.length : 0
  } catch {
    throw new CredentialFormatError('Issuer JWT is not valid JSON')
  }
}
