/**
 * LD-303 consent receipts.
 *
 * A receipt is a portable, server-signed statement of exactly what a person
 * agreed to. It is the concrete form of the ownership claim: both the subject
 * and the named recipient keep a copy, and anyone can check it without an
 * account.
 *
 * Server side. Signed with the platform Ed25519 receipt key, whose private half
 * is AES-256-GCM-wrapped at rest with ISSUER_KEY_SECRET, exactly like issuer
 * keys. Receipts carry terms and categories only. They must NEVER carry vault
 * content, keys, salts, or ciphertext.
 */

import { canonicalize, verifyCredentialSignature } from '@/lib/crypto/credential-verify'
import { signWithPrivateKey } from '@/lib/crypto/credential-signing'

/** Bumped when the meaning of any receipt field changes. */
export const CONSENT_RECEIPT_VERSION = '1.0'

/** The consent policy the receipt was issued under. */
export const CONSENT_POLICY_VERSION = '2026-07-25'

export type ConsentReceiptEvent = 'granted' | 'extended' | 'revoked'

/** Whether the recipient reads live or receives a copy they keep. */
export type ConsentAccessMode = 'one_time' | 'continuous'

export interface ConsentReceiptRecipient {
  /** The recipient identifier recorded on the grant. */
  id: string
  name: string | null
  email: string | null
}

export interface ConsentReceiptCompensation {
  amountCents: number
  currency: string
}

/**
 * The exact object the signature covers. Field order does not matter: the
 * canonical form sorts keys recursively, so a receipt re-serialized by any
 * client still verifies.
 */
export interface ConsentReceiptPayload {
  receiptId: string
  version: string
  policyVersion: string
  event: ConsentReceiptEvent
  issuedAt: string
  supersedesReceiptId: string | null
  consent: {
    consentId: string
    subjectId: string
    recipient: ConsentReceiptRecipient
    dataCategories: string[]
    vaultEntryId: string | null
    purpose: string
    permittedActions: string[]
    accessMode: ConsentAccessMode
    legalBasis: string
    startDate: string
    endDate: string | null
    onwardUseLimit: string
    compensation: ConsentReceiptCompensation | null
    termsVersion: string | null
    revoked: boolean
    revokedAt: string | null
  }
}

/**
 * What the recipient may do with the data, derived from the access level the
 * subject chose. Kept explicit so a receipt states permissions in plain terms
 * rather than an internal enum.
 */
export function permittedActionsFor(accessLevel: string): string[] {
  switch (accessLevel) {
    case 'read':
      return ['read']
    case 'export':
      return ['read', 'export']
    case 'verify':
      return ['verify']
    default:
      return [accessLevel]
  }
}

/**
 * An export hands over a copy the recipient keeps, so revocation cannot recall
 * it. Read and verify are live checks inside the window.
 */
export function accessModeFor(accessLevel: string): ConsentAccessMode {
  return accessLevel === 'export' ? 'one_time' : 'continuous'
}

/**
 * The onward-use limit stated on the receipt. An export is called out
 * explicitly, because a delivered copy cannot be recalled and the receipt must
 * not imply otherwise.
 */
export function onwardUseLimitFor(accessLevel: string): string {
  return accessLevel === 'export'
    ? 'The recipient may not share this data onward. A copy already delivered cannot be recalled by revoking this consent.'
    : 'The recipient may not share this data onward, and access ends when this consent is revoked or expires.'
}

export interface BuildConsentReceiptInput {
  receiptId: string
  event: ConsentReceiptEvent
  issuedAt: string
  supersedesReceiptId?: string | null
  consentId: string
  subjectId: string
  recipient: ConsentReceiptRecipient
  dataCategories: string[]
  vaultEntryId?: string | null
  purpose: string
  accessLevel: string
  startDate: string
  endDate?: string | null
  compensation?: ConsentReceiptCompensation | null
  termsVersion?: string | null
  revoked: boolean
  revokedAt?: string | null
}

/**
 * Build the signable payload. Pure, so the same inputs always produce the same
 * bytes and a receipt can be re-derived and re-checked later.
 */
export function buildConsentReceiptPayload(
  input: BuildConsentReceiptInput
): ConsentReceiptPayload {
  return {
    receiptId: input.receiptId,
    version: CONSENT_RECEIPT_VERSION,
    policyVersion: CONSENT_POLICY_VERSION,
    event: input.event,
    issuedAt: input.issuedAt,
    supersedesReceiptId: input.supersedesReceiptId ?? null,
    consent: {
      consentId: input.consentId,
      subjectId: input.subjectId,
      recipient: input.recipient,
      dataCategories: [...input.dataCategories].sort(),
      vaultEntryId: input.vaultEntryId ?? null,
      purpose: input.purpose,
      permittedActions: permittedActionsFor(input.accessLevel),
      accessMode: accessModeFor(input.accessLevel),
      legalBasis: 'consent',
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      onwardUseLimit: onwardUseLimitFor(input.accessLevel),
      compensation: input.compensation ?? null,
      termsVersion: input.termsVersion ?? null,
      revoked: input.revoked,
      revokedAt: input.revokedAt ?? null,
    },
  }
}

/** The exact bytes covered by the signature, for display or re-verification. */
export function canonicalConsentReceipt(payload: ConsentReceiptPayload): string {
  return canonicalize(payload)
}

/** Sign a receipt payload with the stored (wrapped) platform private key. */
export function signConsentReceipt(
  encryptedPrivateKey: string,
  privateKeyIv: string,
  payload: ConsentReceiptPayload
): string {
  return signWithPrivateKey(encryptedPrivateKey, privateKeyIv, payload)
}

/** Verify a receipt signature against the platform public key. */
export function verifyConsentReceipt(
  publicKeyB64: string,
  payload: unknown,
  signatureB64u: string
): boolean {
  return verifyCredentialSignature(publicKeyB64, payload, signatureB64u)
}
