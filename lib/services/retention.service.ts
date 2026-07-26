/**
 * LD-607 retention enforcement.
 *
 * Before this existed, nothing expired. Answered requests, dead share tokens,
 * old notifications, and purchased exports all sat in the database forever, and
 * a pool's retention_days was a sentence in the UI rather than a rule.
 *
 * Each category is a separate exported function so it can be tested and
 * reasoned about on its own. runRetentionPurge calls them all and reports one
 * total to the job runner.
 *
 * Every purge is idempotent: it deletes what is already past its window, so
 * running it twice deletes nothing the second time.
 */

import { createServiceClient } from '@/lib/supabase/service'
import {
  CONSENT_REQUEST_RETENTION_DAYS,
  CREDENTIAL_REQUEST_RETENTION_DAYS,
  SHARE_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  EXPORT_GRACE_DAYS,
  DAY_MS,
  cutoffIso,
} from '@/lib/constants/retention'

export interface RetentionCategoryResult {
  category: string
  deleted: number
}

/**
 * Requests that were answered or allowed to lapse long enough ago. A live
 * request is never touched: responded_at and expires_at are both null while it
 * is still waiting on the person.
 */
export async function purgeExpiredConsentRequests(
  now: Date = new Date()
): Promise<RetentionCategoryResult> {
  const service = createServiceClient()
  const cutoff = cutoffIso(CONSENT_REQUEST_RETENTION_DAYS, now)

  const { data: answered, error: answeredError } = await service
    .from('consent_requests')
    .delete()
    .lt('responded_at', cutoff)
    .select('id')
  if (answeredError) throw answeredError

  const { data: lapsed, error: lapsedError } = await service
    .from('consent_requests')
    .delete()
    .is('responded_at', null)
    .lt('expires_at', cutoff)
    .select('id')
  if (lapsedError) throw lapsedError

  return {
    category: 'consent_requests',
    deleted: (answered ?? []).length + (lapsed ?? []).length,
  }
}

export async function purgeExpiredCredentialRequests(
  now: Date = new Date()
): Promise<RetentionCategoryResult> {
  const service = createServiceClient()
  const cutoff = cutoffIso(CREDENTIAL_REQUEST_RETENTION_DAYS, now)

  const { data: answered, error: answeredError } = await service
    .from('credential_requests')
    .delete()
    .lt('responded_at', cutoff)
    .select('id')
  if (answeredError) throw answeredError

  const { data: lapsed, error: lapsedError } = await service
    .from('credential_requests')
    .delete()
    .is('responded_at', null)
    .lt('expires_at', cutoff)
    .select('id')
  if (lapsedError) throw lapsedError

  return {
    category: 'credential_requests',
    deleted: (answered ?? []).length + (lapsed ?? []).length,
  }
}

/**
 * Share tokens that are dead and past the grace window. The row carries the
 * claims that were disclosed, so keeping it after the link stops working leaks
 * more than it explains.
 */
export async function purgeExpiredShares(
  now: Date = new Date()
): Promise<RetentionCategoryResult> {
  const service = createServiceClient()
  const cutoff = cutoffIso(SHARE_RETENTION_DAYS, now)

  const { data: expired, error: expiredError } = await service
    .from('credential_shares')
    .delete()
    .lt('expired_at', cutoff)
    .select('id')
  if (expiredError) throw expiredError

  const { data: revoked, error: revokedError } = await service
    .from('credential_shares')
    .delete()
    .eq('revoked', true)
    .lt('revoked_at', cutoff)
    .select('id')
  if (revokedError) throw revokedError

  return {
    category: 'credential_shares',
    deleted: (expired ?? []).length + (revoked ?? []).length,
  }
}

/** Old in-app notifications. Their bodies quote the parties involved. */
export async function purgeOldNotifications(
  now: Date = new Date()
): Promise<RetentionCategoryResult> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('notifications')
    .delete()
    .lt('created_at', cutoffIso(NOTIFICATION_RETENTION_DAYS, now))
    .select('id')
  if (error) throw error
  return { category: 'notifications', deleted: (data ?? []).length }
}

/**
 * Destroy the records behind a purchased export once the buyer's window closes,
 * or once the pool's declared retention_days elapses, whichever comes first.
 *
 * This is what turns retention_days from a claim into a fact. The order row
 * survives so the buyer keeps their purchase record; only the contributed
 * records go.
 */
export async function enforceExportRetention(
  now: Date = new Date()
): Promise<RetentionCategoryResult> {
  const service = createServiceClient()

  const { data: orders, error } = await service
    .from('data_orders')
    .select('id, created_at, export_expires_at, data_pools(retention_days)')
  if (error) throw error

  const expiredOrderIds: string[] = []
  for (const order of orders ?? []) {
    const pool = order.data_pools as { retention_days: number } | null
    const exportDeadline =
      new Date(order.export_expires_at).getTime() + EXPORT_GRACE_DAYS * DAY_MS
    const retentionDeadline = pool
      ? new Date(order.created_at).getTime() + pool.retention_days * DAY_MS
      : Number.POSITIVE_INFINITY
    if (Math.min(exportDeadline, retentionDeadline) <= now.getTime()) {
      expiredOrderIds.push(order.id)
    }
  }

  if (expiredOrderIds.length === 0) {
    return { category: 'data_order_records', deleted: 0 }
  }

  const { data: deleted, error: deleteError } = await service
    .from('data_order_records')
    .delete()
    .in('order_id', expiredOrderIds)
    .select('id')
  if (deleteError) throw deleteError

  return { category: 'data_order_records', deleted: (deleted ?? []).length }
}

export const RETENTION_PURGES = [
  purgeExpiredConsentRequests,
  purgeExpiredCredentialRequests,
  purgeExpiredShares,
  purgeOldNotifications,
  enforceExportRetention,
] as const

/**
 * Run every category. One failing category is reported and the rest still run,
 * so a single bad query cannot stop retention entirely.
 */
export async function runRetentionPurges(
  now: Date = new Date()
): Promise<{ results: RetentionCategoryResult[]; failed: number }> {
  const results: RetentionCategoryResult[] = []
  let failed = 0
  for (const purge of RETENTION_PURGES) {
    try {
      results.push(await purge(now))
    } catch {
      failed += 1
    }
  }
  return { results, failed }
}
