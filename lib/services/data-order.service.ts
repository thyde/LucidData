import { randomBytes } from 'crypto'
import type Stripe from 'stripe'
import * as orderRepo from '@/lib/repositories/data-order.repository'
import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { recordOrderPayouts } from '@/lib/services/payout.service'
import type { DataOrder } from '@/types/database.types'
import {
  isMarketplaceCategoryAllowed,
  type PurchasePoolInput,
} from '@/lib/validations/marketplace'

/** A dataset was free / Stripe is off (completed now), or the buyer must pay via Checkout. */
export type StartPurchaseResult =
  | { kind: 'completed'; order: DataOrder; recordCount: number; totalCents: number }
  | { kind: 'checkout'; url: string; recordCount: number; totalCents: number }

export interface DatasetExport {
  pool: {
    id: string
    name: string
    category: string
    purpose: string
    retentionDays: number
  }
  exportExpiresAt: string
  recordCount: number
  records: { id: string; category: string; payload: unknown; contributed_at: string }[]
}

const EXPORT_WINDOW_DAYS = 7

/** Compute the total for an immutable snapshot purchase. */
function computeTotal(
  pricePerRecordCents: number,
  basePriceCents: number,
  recordCount: number,
  orderType: 'snapshot'
): number {
  void orderType
  return basePriceCents + recordCount * pricePerRecordCents
}

async function createOrderWithSnapshot(
  input: Parameters<typeof orderRepo.createOrder>[0],
  contributions: Awaited<ReturnType<typeof contributionRepo.findActiveContributionsByPool>>
): Promise<DataOrder> {
  const order = await orderRepo.createOrder(input)
  try {
    await orderRepo.createOrderRecords(
      contributions.map((contribution) => ({
        order_id: order.id,
        source_contribution_id: contribution.id,
        source_user_id: contribution.user_id,
        category: contribution.category,
        payload: contribution.anonymized_payload,
        payout_cents: contribution.payout_cents,
        contributed_at: contribution.created_at,
      }))
    )
    return order
  } catch (error) {
    await orderRepo.deleteOrder(order.id).catch(() => undefined)
    throw error
  }
}

/**
 * Begin a dataset purchase for one of the buyer's own pools. Free pools (total 0)
 * and the no-Stripe dev fallback record a paid order immediately. Otherwise a
 * 'pending' order is created and the buyer is sent to Stripe Checkout; the webhook
 * flips the order to 'paid' once payment completes.
 */
export async function startPoolPurchase(
  orgId: string,
  actingUserId: string,
  input: PurchasePoolInput
): Promise<StartPurchaseResult> {
  const pool = await poolRepo.findPoolByOrg(input.pool_id, orgId)
  if (!pool) throw new Error('Pool not found for this organization')
  if (!isMarketplaceCategoryAllowed(pool.category as Parameters<typeof isMarketplaceCategoryAllowed>[0])) {
    throw new Error('This category is not available for marketplace sale')
  }

  const contributions = await contributionRepo.findActiveContributionsByPool(pool.id)
  const recordCount = contributions.length
  const contributorCount = new Set(contributions.map((contribution) => contribution.user_id)).size
  if (contributorCount < pool.minimum_contributors) {
    throw new Error(
      `This pool needs at least ${pool.minimum_contributors} contributors before purchase`
    )
  }
  const totalCents = computeTotal(
    pool.price_per_record_cents,
    pool.price_cents,
    recordCount,
    input.order_type
  )
  const exportToken = randomBytes(24).toString('base64url')
  const exportExpiresAt = new Date(
    Date.now() + EXPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Free datasets, or environments without Stripe configured, complete immediately.
  if (totalCents <= 0 || !isStripeConfigured()) {
    const order = await createOrderWithSnapshot({
      pool_id: pool.id,
      buyer_org_id: orgId,
      order_type: input.order_type,
      record_count: recordCount,
      total_cents: totalCents,
      export_token: exportToken,
      current_period_end: null,
      export_expires_at: exportExpiresAt,
      status: 'paid',
    }, contributions)
    await createAuditEntry({
      userId: actingUserId,
      eventType: 'data_purchased',
      action: `Purchased ${recordCount} record(s) from pool "${pool.name}" (${input.order_type})`,
      actorType: 'buyer',
      metadata: { pool_id: pool.id, order_id: order.id, total_cents: totalCents },
    })
    return { kind: 'completed', order, recordCount, totalCents }
  }

  // Paid path: create a pending order, then a one-time Checkout session.
  const order = await createOrderWithSnapshot({
    pool_id: pool.id,
    buyer_org_id: orgId,
    order_type: input.order_type,
    record_count: recordCount,
    total_cents: totalCents,
    export_token: exportToken,
    current_period_end: null,
    export_expires_at: exportExpiresAt,
    status: 'pending',
  }, contributions)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: {
            name: `Dataset: ${pool.name}`,
            description: `${recordCount} anonymized record(s) (${input.order_type})`,
          },
        },
      },
    ],
    metadata: { kind: 'data_order', orderId: order.id, orgId, userId: actingUserId },
    payment_intent_data: { metadata: { kind: 'data_order', orderId: order.id } },
    success_url: `${appUrl}/org/${orgId}/data?order=success`,
    cancel_url: `${appUrl}/org/${orgId}/data?order=cancelled`,
  })
  await orderRepo.updateOrder(order.id, { stripe_checkout_session_id: session.id })
  if (!session.url) throw new Error('Stripe did not return a checkout URL.')

  return { kind: 'checkout', url: session.url, recordCount, totalCents }
}

/** Webhook: mark a data order paid once its Checkout session completes. Idempotent. */
export async function markDataOrderPaid(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId
  if (!orderId) return
  const order = await orderRepo.findOrderById(orderId)
  if (!order || order.status === 'paid') return

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null
  const paidOrder = await orderRepo.updateOrder(orderId, {
    status: 'paid',
    stripe_payment_intent_id: paymentIntentId,
  })

  const userId = session.metadata?.userId
  if (userId) {
    await createAuditEntry({
      userId,
      eventType: 'data_purchased',
      action: `Paid for ${order.record_count} record(s) (order ${orderId.slice(0, 8)})`,
      actorType: 'buyer',
      metadata: { pool_id: order.pool_id, order_id: orderId, total_cents: order.total_cents },
    })
  }

  // Queue contributor payouts for this purchase (best-effort; webhook stays 200).
  await recordOrderPayouts(paidOrder).catch((e) =>
    console.error('recordOrderPayouts failed for order', orderId, e)
  )
}

/** Webhook: cancel a pending data order whose Checkout session expired. */
export async function markDataOrderCanceled(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId
  if (!orderId) return
  const order = await orderRepo.findOrderById(orderId)
  if (!order || order.status !== 'pending') return
  await orderRepo.updateOrder(orderId, { status: 'canceled' })
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
  if (order.status !== 'paid') throw new Error('This order has not been paid yet')
  if (new Date(order.export_expires_at).getTime() <= Date.now()) {
    throw new Error('This export link has expired')
  }

  const pool = await poolRepo.findPoolByOrg(order.pool_id, orgId)
  if (!pool) throw new Error('Pool not found')

  const records = await orderRepo.findOrderRecords(order.id)

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'data_exported',
    action: `Exported dataset for pool "${pool.name}" (${records.length} records)`,
    actorType: 'buyer',
    metadata: { pool_id: pool.id, order_id: order.id },
  })

  return {
    pool: {
      id: pool.id,
      name: pool.name,
      category: pool.category,
      purpose: pool.purpose,
      retentionDays: pool.retention_days,
    },
    exportExpiresAt: order.export_expires_at,
    recordCount: records.length,
    records: records.map((record) => ({
      id: record.source_contribution_id ?? record.id,
      category: record.category,
      payload: record.payload,
      contributed_at: record.contributed_at,
    })),
  }
}
