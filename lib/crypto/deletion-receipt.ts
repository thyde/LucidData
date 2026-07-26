/**
 * LD-607 deletion receipts.
 *
 * A person who erases their account gets a signed statement of what was
 * removed, what could not be removed, and who still holds what. Without it,
 * "your data is gone" is an assertion nobody can check.
 *
 * Server side. Signed with the platform Ed25519 key, whose private half is
 * AES-256-GCM-wrapped at rest with ISSUER_KEY_SECRET, exactly like consent
 * receipts. The payload carries counts and table names only. It must NEVER
 * carry vault content, an email address, claims, or key material.
 */

import { createHash } from 'crypto'
import { canonicalize, verifyCredentialSignature } from '@/lib/crypto/credential-verify'
import { signWithPrivateKey } from '@/lib/crypto/credential-signing'
import type { DeletionBehaviour } from '@/lib/constants/deletion-manifest'

/** Bumped when the meaning of any receipt field changes. */
export const DELETION_RECEIPT_VERSION = '1.0'

export interface DeletionTableOutcome {
  table: string
  behaviour: DeletionBehaviour
  /** Rows removed or stripped for this person. */
  affected: number
}

export interface DeletionResidual {
  holder: string
  what: string
  why: string
}

export interface DeletionReceiptPayload {
  receiptId: string
  version: string
  issuedAt: string
  subject: {
    /** The account id. Random, and no longer resolves to anything. */
    subjectId: string
    /** SHA-256 of the lowercased email, so the person can prove which account. */
    subjectEmailHash: string
  }
  outcome: {
    tables: DeletionTableOutcome[]
    /** Tables checked afterwards that still held a row. Empty means verified. */
    residualTables: string[]
    verified: boolean
  }
  residualDisclosures: DeletionResidual[]
}

/**
 * Hash the email rather than storing it. The person can recompute this from the
 * address they used and match it to their receipt; we cannot recover the
 * address from the hash.
 */
export function hashSubjectEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')
}

export interface BuildDeletionReceiptInput {
  receiptId: string
  issuedAt: string
  subjectId: string
  subjectEmail: string
  tables: DeletionTableOutcome[]
  residualTables: string[]
  residualDisclosures: readonly DeletionResidual[]
}

/**
 * Build the signable payload. Pure, and the table list is sorted, so the same
 * deletion always produces the same bytes and the receipt can be re-checked.
 */
export function buildDeletionReceiptPayload(
  input: BuildDeletionReceiptInput
): DeletionReceiptPayload {
  return {
    receiptId: input.receiptId,
    version: DELETION_RECEIPT_VERSION,
    issuedAt: input.issuedAt,
    subject: {
      subjectId: input.subjectId,
      subjectEmailHash: hashSubjectEmail(input.subjectEmail),
    },
    outcome: {
      tables: [...input.tables].sort((a, b) => a.table.localeCompare(b.table)),
      residualTables: [...input.residualTables].sort(),
      verified: input.residualTables.length === 0,
    },
    residualDisclosures: input.residualDisclosures.map((entry) => ({
      holder: entry.holder,
      what: entry.what,
      why: entry.why,
    })),
  }
}

/** The exact bytes covered by the signature, for display or re-verification. */
export function canonicalDeletionReceipt(payload: DeletionReceiptPayload): string {
  return canonicalize(payload)
}

/** Sign a receipt payload with the stored (wrapped) platform private key. */
export function signDeletionReceipt(
  encryptedPrivateKey: string,
  privateKeyIv: string,
  payload: DeletionReceiptPayload
): string {
  return signWithPrivateKey(encryptedPrivateKey, privateKeyIv, payload)
}

/** Verify a receipt signature against the platform public key. */
export function verifyDeletionReceipt(
  publicKeyB64: string,
  payload: unknown,
  signatureB64u: string
): boolean {
  return verifyCredentialSignature(publicKeyB64, payload, signatureB64u)
}
