import { randomBytes } from 'crypto'
import * as orderRepo from '@/lib/repositories/data-order.repository'
import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { DataOrder } from '@/types/database.types'
import type { PurchasePoolInput } from '@/lib/validations/marketplace'

export interface PurchaseResult {
  order: DataOrder
  recordCount: number
  totalCents: number
}

export interface DatasetExport {
  pool: { id: string; name: string; category: string }
  recordCount: number
  records: { id: string; category: string; payload: unknown; contributed_at: string }[]
}

/** Compute the stubbed total for a purchase. */
function computeTotal(
  pricePerRecordCents: number,
  basePriceCents: number,
  recordCount: number,
  orderType: 'snapshot' | 'subscription'
): number {
  if (orderType === 'subscription') return basePriceCents
  return basePriceCents + recordCount * pricePerRecordCents
}

/**
 * Buyer purchases the assembled dataset for one of their own pools. Payment is
 * stubbed: an order is recorded and an export token is issued, but nothing is charged.
 */
export async function purchasePool(
  orgId: string,
  actingUserId: string,
  input: PurchasePoolInput
): Promise<PurchaseResult> {
  const pool = await poolRepo.findPoolByOrg(input.pool_id, orgId)
  if (!pool) throw new Error('Pool not found for this organization')

  const recordCount = await contributionRepo.countActiveContributions(pool.id)
  const totalCents = computeTotal(
    pool.price_per_record_cents,
    pool.price_cents,
    recordCount,
    input.order_type
  )
  const exportToken = randomBytes(24).toString('base64url')
  const currentPeriodEnd =
    input.order_type === 'subscription'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null

  const order = await orderRepo.createOrder({
    pool_id: pool.id,
    buyer_org_id: orgId,
    order_type: input.order_type,
    record_count: recordCount,
    total_cents: totalCents,
    export_token: exportToken,
    current_period_end: currentPeriodEnd,
  })

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'data_purchased',
    action: `Purchased ${recordCount} record(s) from pool "${pool.name}" (${input.order_type})`,
    actorType: 'buyer',
    metadata: { pool_id: pool.id, order_id: order.id, total_cents: totalCents },
  })

  return { order, recordCount, totalCents }
}

export async function listOrders(orgId: string): Promise<DataOrder[]> {
  return orderRepo.findOrdersByOrg(orgId)
}

/** Resolve a purchased dataset for download. Scoped to the buying org. */
export async function getExport(
  orgId: string,
  actingUserId: string,
  token: string
): Promise<DatasetExport> {
  const order = await orderRepo.findOrderByToken(token)
  if (!order || order.buyer_org_id !== orgId) throw new Error('Export not found')

  const pool = await poolRepo.findPoolByOrg(order.pool_id, orgId)
  if (!pool) throw new Error('Pool not found')

  const contributions = await contributionRepo.findActiveContributionsByPool(order.pool_id)

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'data_exported',
    action: `Exported dataset for pool "${pool.name}" (${contributions.length} records)`,
    actorType: 'buyer',
    metadata: { pool_id: pool.id, order_id: order.id },
  })

  return {
    pool: { id: pool.id, name: pool.name, category: pool.category },
    recordCount: contributions.length,
    records: contributions.map((c) => ({
      id: c.id,
      category: c.category,
      payload: c.anonymized_payload,
      contributed_at: c.created_at,
    })),
  }
}
