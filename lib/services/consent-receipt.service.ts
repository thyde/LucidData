import { randomUUID } from 'crypto'
import * as receiptRepo from '@/lib/repositories/consent-receipt.repository'
import { getOrCreateActivePlatformKey, getPlatformKeyById } from '@/lib/services/platform-key.service'
import { createAuditEntry } from '@/lib/services/audit.service'
import {
  buildConsentReceiptPayload,
  signConsentReceipt,
  verifyConsentReceipt,
  type ConsentReceiptEvent,
  type ConsentReceiptPayload,
} from '@/lib/crypto/consent-receipt'
import type { Consent, ConsentReceipt, Json } from '@/types/database.types'

/**
 * LD-303 consent receipts.
 *
 * Every consent state change emits a signed receipt. Receipts are append-only:
 * an extension or revocation produces a NEW receipt that references the one it
 * supersedes, so the original statement of what was agreed stays intact.
 *
 * A receipt carries terms only (categories, purpose, window, permitted actions).
 * It must never carry vault content, ciphertext, or key material.
 */

export interface IssuedConsentReceipt {
  receipt: ConsentReceipt
  payload: ConsentReceiptPayload
}

function dataCategoriesFor(consent: Consent): string[] {
  return consent.data_category ? [consent.data_category] : []
}

/**
 * Create and sign a receipt for a consent state change, chaining it to the
 * previous receipt for the same consent.
 */
export async function issueConsentReceipt(
  consent: Consent,
  event: ConsentReceiptEvent
): Promise<IssuedConsentReceipt> {
  const previous = await receiptRepo.findLatestReceiptForConsent(consent.id)
  const key = await getOrCreateActivePlatformKey('consent_receipt')

  const receiptId = randomUUID()
  const payload = buildConsentReceiptPayload({
    receiptId,
    event,
    issuedAt: new Date().toISOString(),
    supersedesReceiptId: previous?.id ?? null,
    consentId: consent.id,
    subjectId: consent.user_id,
    recipient: {
      id: consent.granted_to,
      name: consent.granted_to_name,
      email: consent.granted_to_email,
    },
    dataCategories: dataCategoriesFor(consent),
    vaultEntryId: consent.vault_data_id,
    purpose: consent.purpose,
    accessLevel: consent.access_level,
    startDate: consent.start_date,
    endDate: consent.end_date,
    termsVersion: consent.terms_version,
    revoked: consent.revoked,
    revokedAt: consent.revoked_at,
  })

  const signature = signConsentReceipt(
    key.encrypted_private_key,
    key.private_key_iv,
    payload
  )

  const receipt = await receiptRepo.insertReceipt({
    id: receiptId,
    consent_id: consent.id,
    user_id: consent.user_id,
    event,
    recipient: consent.granted_to,
    recipient_email: consent.granted_to_email,
    supersedes_receipt_id: previous?.id ?? null,
    payload: payload as unknown as Json,
    signature,
    key_id: key.key_id,
  })

  // Bind the receipt into the tamper-evident audit chain.
  await createAuditEntry({
    userId: consent.user_id,
    eventType: 'consent_receipt_issued',
    action: `Issued a ${event} consent receipt for ${consent.granted_to_name ?? consent.granted_to}`,
    consentId: consent.id,
    metadata: { receipt_id: receipt.id, event, signature_key_id: key.key_id },
  })

  return { receipt, payload }
}

export type ConsentReceiptVerification =
  | { found: false }
  | {
      found: true
      valid: boolean
      receipt: ConsentReceipt
      payload: ConsentReceiptPayload
      keyId: string
    }

/**
 * Verify a receipt's signature against the key that signed it, so a receipt
 * stays verifiable after the platform key rotates. Any byte changed in the
 * stored payload makes this fail.
 */
export async function verifyConsentReceiptById(
  id: string
): Promise<ConsentReceiptVerification> {
  const receipt = await receiptRepo.findReceiptById(id)
  if (!receipt) return { found: false }

  const key = await getPlatformKeyById(receipt.key_id)
  const payload = receipt.payload as unknown as ConsentReceiptPayload
  const valid = key
    ? verifyConsentReceipt(key.public_key, payload, receipt.signature)
    : false

  return { found: true, valid, receipt, payload, keyId: receipt.key_id }
}

/** Receipts for one consent, resolved by RLS (subject or named recipient). */
export async function getReceiptsForConsent(consentId: string): Promise<ConsentReceipt[]> {
  return receiptRepo.findReceiptsForConsent(consentId)
}

/** Every receipt belonging to a subject. */
export async function getReceiptsForUser(userId: string): Promise<ConsentReceipt[]> {
  return receiptRepo.findReceiptsForUser(userId)
}
