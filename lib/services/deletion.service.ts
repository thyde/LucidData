/**
 * LD-607 explicit account deletion.
 *
 * Deletion used to be one call to admin.deleteUser and a hope that foreign keys
 * did the rest. Two of them did not: issued_credentials.subject_user_id and
 * data_order_records.source_user_id are ON DELETE SET NULL, so a person's
 * claims and contributed payloads survived erasure with a nulled key beside
 * intact personal data. A nulled foreign key next to a full payload is not
 * anonymization.
 *
 * The order below matters. Everything that does not cascade is handled first,
 * then the auth user is deleted, then the result is verified rather than
 * assumed, and finally the person is handed signed evidence.
 */

import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { getOrCreateActivePlatformKey } from '@/lib/services/platform-key.service'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import {
  DELETION_MANIFEST,
  RESIDUAL_DISCLOSURES,
  tablesRequiringNoResidue,
} from '@/lib/constants/deletion-manifest'
import {
  buildDeletionReceiptPayload,
  hashSubjectEmail,
  signDeletionReceipt,
  type DeletionReceiptPayload,
  type DeletionTableOutcome,
} from '@/lib/crypto/deletion-receipt'
import type { Json } from '@/types/database.types'

export interface DeletionOutcome {
  tables: DeletionTableOutcome[]
  residualTables: string[]
  verified: boolean
  receipt: DeletionReceiptPayload
  signature: string
  keyId: string
}

function countOf(rows: { id?: string }[] | null): number {
  return (rows ?? []).length
}

/**
 * Delete credentials issued about this person. The foreign key would only null
 * the id, leaving the claims and the subject email behind. Verification of a
 * deleted credential fails closed, which is the correct answer once the subject
 * has erased themselves.
 */
async function deleteIssuedCredentials(userId: string): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issued_credentials')
    .delete()
    .eq('subject_user_id', userId)
    .select('id')
  if (error) throw error
  return countOf(data)
}

/**
 * Strip contributed records instead of deleting them: a buyer paid for the
 * dataset and data_orders.record_count has to stay consistent. What survives is
 * a counted, category-tagged placeholder with an empty payload and no link back
 * to anyone.
 */
async function redactOrderRecords(userId: string): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_order_records')
    .update({
      payload: {} as Json,
      source_user_id: null,
      source_contribution_id: null,
      redacted_at: new Date().toISOString(),
    })
    .eq('source_user_id', userId)
    .select('id')
  if (error) throw error
  return countOf(data)
}

/**
 * Invitations addressed to this person. The email is stored as text, so nothing
 * cascades and the address would otherwise outlive the account.
 */
async function deleteOrgInvitations(email: string): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_invitations')
    .delete()
    .eq('email', email)
    .select('id')
  if (error) throw error
  return countOf(data)
}

/**
 * Rate-limit counters keyed on this person. Buckets are `${name}:${subject}`,
 * so the subject id is an identifier even though the table has no user column.
 */
async function deleteRateLimitCounters(userId: string): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rate_limit_counters')
    .delete()
    .like('bucket', `%:${userId}`)
    .select('bucket')
  if (error) throw error
  return (data ?? []).length
}

/**
 * Close the connected payment account. Best-effort: a provider outage must not
 * block a person's right to erasure. What the provider keeps afterwards is
 * disclosed on the receipt rather than quietly ignored.
 */
async function deleteConnectedAccount(userId: string): Promise<boolean> {
  if (!isStripeConfigured()) return false
  const service = createServiceClient()
  const { data } = await service
    .from('payout_accounts')
    .select('stripe_account_id')
    .eq('user_id', userId)
    .maybeSingle()
  const accountId = (data as { stripe_account_id: string } | null)?.stripe_account_id
  if (!accountId) return false

  try {
    await getStripe().accounts.del(accountId)
    return true
  } catch (error) {
    errorLogger.log(error, ErrorSeverity.MEDIUM, {
      userId,
      action: 'CONNECTED_ACCOUNT_DELETE_FAILED',
      resource: 'payout_accounts',
    })
    return false
  }
}

/**
 * Check what actually happened rather than trusting the statements above.
 * Queries every manifest table that should hold nothing for this person and
 * returns the ones that still do.
 */
export async function findResidualData(
  userId: string,
  email: string
): Promise<string[]> {
  const service = createServiceClient()
  const residual: string[] = []

  for (const entry of tablesRequiringNoResidue()) {
    const column = entry.userColumn
    if (!column) continue

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (service.from(entry.table as any) as any).select(column, {
        count: 'exact',
        head: true,
      })
      if (entry.table === 'org_invitations') query = query.eq(column, email)
      else if (entry.table === 'rate_limit_counters') query = query.like(column, `%:${userId}`)
      else query = query.eq(column, userId)

      const { count, error } = await query
      if (error) throw error
      if ((count ?? 0) > 0) residual.push(entry.table)
    } catch (error) {
      // A table we cannot check is a table we cannot vouch for.
      errorLogger.log(error, ErrorSeverity.MEDIUM, {
        userId,
        action: 'DELETION_VERIFICATION_FAILED',
        resource: entry.table,
      })
      residual.push(entry.table)
    }
  }

  return residual
}

/**
 * Erase every trace of a person, then prove it.
 *
 * The caller is responsible for authentication, step-up, and flushing any owed
 * balance before this runs.
 */
export async function eraseUser(
  userId: string,
  email: string
): Promise<DeletionOutcome> {
  const tables: DeletionTableOutcome[] = []
  const record = (table: string, affected: number) => {
    const entry = DELETION_MANIFEST.find((candidate) => candidate.table === table)
    if (entry) tables.push({ table, behaviour: entry.behaviour, affected })
  }

  // 1. Everything that does not cascade, while the rows are still findable.
  record('issued_credentials', await deleteIssuedCredentials(userId))
  record('data_order_records', await redactOrderRecords(userId))
  record('org_invitations', await deleteOrgInvitations(email))
  record('rate_limit_counters', await deleteRateLimitCounters(userId))

  // 2. Third-party cleanup, before the local link disappears.
  const connectedAccountDeleted = await deleteConnectedAccount(userId)

  // 3. The audit entry has to be written while the user row still exists, since
  //    audit_logs.user_id cascades. It is the last thing their chain records.
  await createAuditEntry({
    userId,
    eventType: 'account_deleted',
    action: 'Account and all associated data deleted by the user',
    metadata: {
      connected_account_deleted: connectedAccountDeleted,
      non_cascading_tables: tables.map((entry) => entry.table),
    },
  }).catch(() => undefined)

  // 4. The auth user. Everything with ON DELETE CASCADE goes with it.
  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) throw error

  for (const entry of DELETION_MANIFEST) {
    if (entry.behaviour === 'cascade') record(entry.table, 0)
  }

  // 5. Verify rather than assume.
  const residualTables = await findResidualData(userId, email)
  if (residualTables.length > 0) {
    errorLogger.log(
      new Error(`Residual data after deletion: ${residualTables.join(', ')}`),
      ErrorSeverity.HIGH,
      { userId, action: 'DELETION_INCOMPLETE', resource: 'account' }
    )
  }

  // 6. Evidence the person can keep and check.
  const key = await getOrCreateActivePlatformKey('deletion_receipt')
  const receiptId = randomUUID()
  const receipt = buildDeletionReceiptPayload({
    receiptId,
    issuedAt: new Date().toISOString(),
    subjectId: userId,
    subjectEmail: email,
    tables,
    residualTables,
    residualDisclosures: RESIDUAL_DISCLOSURES,
  })
  const signature = signDeletionReceipt(
    key.encrypted_private_key,
    key.private_key_iv,
    receipt
  )

  await service
    .from('deletion_receipts')
    .insert({
      id: receiptId,
      subject_id: userId,
      subject_email_hash: hashSubjectEmail(email),
      payload: receipt as unknown as Json,
      signature,
      key_id: key.key_id,
    })
    .then(undefined, (error: unknown) => {
      errorLogger.log(error, ErrorSeverity.MEDIUM, {
        userId,
        action: 'DELETION_RECEIPT_PERSIST_FAILED',
        resource: 'deletion_receipts',
      })
    })

  return {
    tables,
    residualTables,
    verified: residualTables.length === 0,
    receipt,
    signature,
    keyId: key.key_id,
  }
}
