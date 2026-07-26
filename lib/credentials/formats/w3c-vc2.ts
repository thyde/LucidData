/**
 * LD-401 W3C Verifiable Credentials 2.0 format.
 *
 * The interoperability baseline. VC 2.0 is final, which is why this one is not
 * version-pinned to a draft the way SD-JWT VC is.
 *
 * The proof is Ed25519 over this module's canonical serialization rather than
 * over JSON-LD canonicalization (RDF Dataset Canonicalization). That is a real
 * and stated limitation: the document is structurally interoperable and a
 * verifier that uses our canonicalization can check it, but a verifier that
 * insists on a normative LD proof cannot. Full LD-proof conformance means
 * pulling in an RDF canonicalization implementation, which is a larger
 * dependency than this increment justifies, and the `describe` text says so
 * rather than implying conformance we do not have.
 */

import crypto from 'crypto'
import { canonicalBytes } from '@/lib/crypto/credential-verify'
import {
  type CredentialClaims,
  type CredentialFormat,
  type IssueRequest,
  type IssuedArtifact,
  type IssuerSigner,
  type VerifyOptions,
  type VerifyResult,
} from './types'

const FORMAT = 'w3c-vc'
const VERSION = '2.0'
const VC_CONTEXT = 'https://www.w3.org/ns/credentials/v2'

/** Kept in sync with lib/services/credential.service.ts. */
export const LUCID_CONTEXT = 'https://luciddatabank.com/credentials/v1'

function issuerId(request: IssueRequest): string {
  return request.issuerDomain
    ? `did:web:${request.issuerDomain}`
    : `urn:lucid:org:${request.issuerOrgId}`
}

/** The document without its proof, which is the object the signature covers. */
function unsignedDocument(request: IssueRequest): Record<string, unknown> {
  return {
    '@context': [VC_CONTEXT, LUCID_CONTEXT],
    id: `urn:uuid:${request.credentialId}`,
    type: ['VerifiableCredential', request.schemaType],
    issuer: { id: issuerId(request), name: request.issuerName },
    validFrom: request.issuedAt,
    ...(request.expiresAt ? { validUntil: request.expiresAt } : {}),
    credentialSubject: { email: request.subjectEmail, ...request.claims },
    name: request.label,
  }
}

export const w3cVc2Format: CredentialFormat = {
  format: FORMAT,
  version: VERSION,
  label: 'W3C Verifiable Credential 2.0',

  describe() {
    return (
      'A Verifiable Credential in the W3C 2.0 data model. The proof is Ed25519 over ' +
      'a deterministic JSON serialization rather than over RDF canonicalization, so a ' +
      'verifier that requires a normative Linked Data proof cannot check it yet.'
    )
  },

  issue(request: IssueRequest, signer: IssuerSigner): IssuedArtifact {
    const unsigned = unsignedDocument(request)
    const signature = signer.sign(canonicalBytes(unsigned))

    const document = {
      ...unsigned,
      proof: {
        type: 'Ed25519Signature2020',
        created: request.issuedAt,
        verificationMethod: signer.keyId,
        proofPurpose: 'assertionMethod',
        cryptosuite: 'lucid-canonical-json-2026',
        proofValue: signature.toString('base64url'),
      },
    }

    return {
      // Serialized once and stored, so the bytes a verifier checks are the bytes
      // that were signed rather than a re-serialization that might differ.
      serialized: JSON.stringify(document),
      document,
      formatVersion: { format: FORMAT, version: VERSION },
      keyId: signer.keyId,
    }
  },

  verify(serialized: string, options: VerifyOptions): VerifyResult {
    const formatVersion = { format: FORMAT, version: VERSION }
    const warnings: string[] = []
    const fail = (reason: string): VerifyResult => ({
      valid: false,
      reasons: [reason],
      warnings,
      disclosed: {},
      formatVersion,
    })

    let document: Record<string, unknown>
    try {
      document = JSON.parse(serialized)
    } catch {
      return fail('Credential is not valid JSON')
    }

    const proof = document.proof as Record<string, unknown> | undefined
    if (!proof) return fail('Credential carries no proof')
    if (proof.type !== 'Ed25519Signature2020') {
      return fail(`Unsupported proof type: ${String(proof.type)}`)
    }

    const keyId = String(proof.verificationMethod ?? '')
    const key = options.keys.find((candidate) => candidate.keyId === keyId)
    if (!key) return fail('Signed by a key this verifier does not hold')

    // Reconstruct exactly what was signed by removing the proof, which is the
    // only part of the document that did not exist when the signature was made.
    const { proof: _omitted, ...unsigned } = document
    void _omitted

    let signatureValid = false
    try {
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(key.publicKeyB64, 'base64'),
        format: 'der',
        type: 'spki',
      })
      signatureValid = crypto.verify(
        null,
        canonicalBytes(unsigned),
        publicKey,
        Buffer.from(String(proof.proofValue ?? ''), 'base64url')
      )
    } catch {
      signatureValid = false
    }
    if (!signatureValid) return fail('Issuer signature does not verify')

    const reasons: string[] = []
    const now = options.now ?? new Date()
    if (document.validUntil && new Date(String(document.validUntil)) <= now) {
      reasons.push('Credential has expired')
    }
    if (document.validFrom && new Date(String(document.validFrom)) > now) {
      reasons.push('Credential is not yet valid')
    }

    if (options.expectedNonce !== undefined) {
      // VC 2.0 on its own is a credential, not a presentation, so it carries no
      // nonce. A verifier asking for one must not be told the check passed.
      reasons.push('This format carries no presentation nonce, so freshness cannot be checked')
    }

    const subject = (document.credentialSubject ?? {}) as CredentialClaims
    const { email: _email, ...claims } = subject as { email?: unknown } & CredentialClaims
    void _email

    return {
      valid: reasons.length === 0,
      reasons,
      warnings,
      disclosed: claims,
      formatVersion,
    }
  },
}
