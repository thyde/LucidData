import { UserFacingError } from '@/lib/actions/action-result'

/**
 * LD-401 credential format registry, shared types.
 *
 * LucidData signs credentials with Ed25519 over a canonical payload. That is
 * cryptographically sound and completely non-interoperable: the credential
 * works inside LucidData and nowhere else, which caps what an organization can
 * do with one and rules out the offline presentation LD-404 needs.
 *
 * A format is the pair of functions that turn a credential into bytes someone
 * else can check, and back. Keeping them behind one interface is what lets
 * formats be added without touching issuance, and what makes "an unknown format
 * fails closed" a property of the registry rather than a habit at each call
 * site.
 *
 * The existing Ed25519 payload is registered as a format alongside the
 * standards ones rather than treated as the special case everything else is
 * measured against. That is deliberate: it stops the native format quietly
 * accumulating privileges the others do not have.
 */

/** A format identifier and the version of its rules that were applied. */
export interface FormatVersion {
  format: string
  version: string
}

export interface IssuerSigner {
  /** Key identifier recorded on the credential, so verification selects the right key. */
  keyId: string
  /** Sign raw bytes with the issuer's Ed25519 private key. */
  sign(message: Buffer): Buffer
}

export interface IssuerPublicKey {
  keyId: string
  /** base64(DER SPKI). */
  publicKeyB64: string
}

export interface CredentialClaims {
  [key: string]: unknown
}

export interface IssueRequest {
  credentialId: string
  schemaType: string
  label: string
  subjectEmail: string
  claims: CredentialClaims
  issuerName: string
  /** Verified DNS domain, when the issuer has one. Used to build a did:web id. */
  issuerDomain: string | null
  issuerOrgId: string
  issuedAt: string
  expiresAt: string | null
}

export interface IssuedArtifact {
  /**
   * The exact bytes a verifier checks.
   *
   * Stored verbatim rather than rebuilt on read. A format that round-trips
   * through a parser and back is a format whose signature can break on a
   * serializer change, and the failure would look like tampering.
   */
  serialized: string
  /** Parsed form, for display and for storing alongside the bytes. */
  document: Record<string, unknown>
  formatVersion: FormatVersion
  keyId: string
}

export interface VerifyResult {
  valid: boolean
  /** Why verification failed. Empty when valid. */
  reasons: string[]
  /** Non-fatal notes, such as a key later reported compromised. */
  warnings: string[]
  /** Claims the artifact actually disclosed, which may be fewer than were issued. */
  disclosed: CredentialClaims
  formatVersion: FormatVersion
}

export interface VerifyOptions {
  /** Keys the verifier is willing to trust, by key id. */
  keys: IssuerPublicKey[]
  /** Current time, injected so expiry is testable. */
  now?: Date
  /**
   * Nonce the verifier supplied for this presentation.
   *
   * When present, a presentation that does not echo it is rejected. This is
   * what stops a captured presentation being replayed.
   */
  expectedNonce?: string
  /** Audience the presentation must name, where the format carries one. */
  expectedAudience?: string
}

export interface CredentialFormat {
  format: string
  version: string
  /** Human label for the trust centre and the issuer UI. */
  label: string
  /** What a verifier can do with this format, in plain terms. */
  describe(): string
  issue(request: IssueRequest, signer: IssuerSigner): IssuedArtifact
  verify(serialized: string, options: VerifyOptions): VerifyResult
}

/** Raised when a format is unknown, ambiguous, or malformed. */
export class CredentialFormatError extends UserFacingError {
  constructor(message: string) {
    super(message, 'credential_format')
    this.name = 'CredentialFormatError'
  }
}
