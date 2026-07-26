/**
 * LD-401 native Ed25519 format.
 *
 * The format LucidData has issued since the beginning, registered here as a
 * peer of the standards formats rather than as the baseline they are measured
 * against. Every credential issued before LD-401 is in this format, and the
 * migration test that proves they still verify goes through this module.
 *
 * Registering it has a second purpose. It keeps the native format inside the
 * same interface as the others, so it cannot quietly gain behaviour the
 * standards formats lack, and so removing it later is a registry change rather
 * than an archaeology exercise.
 */

import { canonicalBytes, verifyCredentialSignature } from '@/lib/crypto/credential-verify'
import crypto from 'crypto'
import {
  type CredentialClaims,
  type CredentialFormat,
  type IssueRequest,
  type IssuedArtifact,
  type IssuerSigner,
  type VerifyOptions,
  type VerifyResult,
} from './types'

const FORMAT = 'lucid-ed25519'
const VERSION = '1'

/** The payload shape credential.service.ts has always signed. Do not reorder. */
export interface LucidCredentialPayload {
  '@context': string
  id: string
  type: string
  label: string
  issuer: { id: string; name: string; domain?: string | null }
  subject: { email: string }
  claims: CredentialClaims
  issued_at: string
  expires_at: string | null
}

export const LUCID_CONTEXT = 'https://luciddatabank.com/credentials/v1'

export const lucidEd25519Format: CredentialFormat = {
  format: FORMAT,
  version: VERSION,
  label: 'LucidData Ed25519',

  describe() {
    return (
      'The original LucidData credential: Ed25519 over a canonical JSON payload. ' +
      'Sound, and readable only by software that knows this shape, which is why the ' +
      'standards formats exist alongside it.'
    )
  },

  issue(request: IssueRequest, signer: IssuerSigner): IssuedArtifact {
    const payload: LucidCredentialPayload = {
      '@context': LUCID_CONTEXT,
      id: request.credentialId,
      type: request.schemaType,
      label: request.label,
      issuer: {
        id: request.issuerOrgId,
        name: request.issuerName,
        domain: request.issuerDomain,
      },
      subject: { email: request.subjectEmail },
      claims: request.claims,
      issued_at: request.issuedAt,
      expires_at: request.expiresAt,
    }

    const signature = signer.sign(canonicalBytes(payload))

    return {
      serialized: JSON.stringify({ payload, signature: signature.toString('base64url') }),
      document: payload as unknown as Record<string, unknown>,
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

    let envelope: { payload?: LucidCredentialPayload; signature?: string; key_id?: string }
    try {
      envelope = JSON.parse(serialized)
    } catch {
      return fail('Credential is not valid JSON')
    }

    const payload = envelope.payload
    const signature = envelope.signature
    if (!payload || !signature) return fail('Credential is missing its payload or signature')

    // A credential issued before this registry existed carries its key id on the
    // row rather than in the envelope, so the caller passes the candidate keys
    // and any one of them may be the right one.
    const candidates = envelope.key_id
      ? options.keys.filter((entry) => entry.keyId === envelope.key_id)
      : options.keys

    if (candidates.length === 0) return fail('Signed by a key this verifier does not hold')

    const matched = candidates.find((entry) =>
      verifyCredentialSignature(entry.publicKeyB64, payload, signature)
    )
    if (!matched) return fail('Issuer signature does not verify')

    const reasons: string[] = []
    const now = options.now ?? new Date()
    if (payload.expires_at && new Date(payload.expires_at) <= now) {
      reasons.push('Credential has expired')
    }
    if (options.expectedNonce !== undefined) {
      reasons.push('This format carries no presentation nonce, so freshness cannot be checked')
    }

    return {
      valid: reasons.length === 0,
      reasons,
      warnings,
      disclosed: payload.claims ?? {},
      formatVersion,
    }
  },
}

/**
 * Build a signer from an Ed25519 private key.
 *
 * Kept here rather than in the registry so the crypto boundary stays inside the
 * format layer and callers hand over a key rather than raw signing behaviour.
 */
export function signerFromPrivateKey(keyId: string, privateKey: crypto.KeyObject): IssuerSigner {
  return {
    keyId,
    sign: (message: Buffer) => crypto.sign(null, message, privateKey),
  }
}
