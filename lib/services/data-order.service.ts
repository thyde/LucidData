import { randomBytes } from 'crypto'
import type Stripe from 'stripe'
import * as orderRepo from '@/lib/repositories/data-order.repository'
import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import type { DataOrder } from '@/types/database.types'
import type { PurchasePoolInput } from '@/lib/validations/marketplace'

/** A dataset was free / Stripe is off (completed now), or the buyer must pay via Checkout. */
export type StartPurchaseResult =
  | { kind: 'completed'; order: DataOrder; recordCount: number; totalCents: number }
  | { kind: 'checkout'; url: string; recordCount: number; totalCents: number }

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

  // Free datasets, or environments without Stripe configured, complete immediately.
  if (totalCents <= 0 || !isStripeConfigured()) {
    const order = await orderRepo.createOrder({
      pool_id: pool.id,
      buyer_org_id: orgId,
      order_type: input.order_type,
      record_count: recordCount,
      total_cents: totalCents,
      export_token: exportToken,
      current_period_end: currentPeriodEnd,
      status: 'paid',
    })
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
  const order = await orderRepo.createOrder({
    pool_id: pool.id,
    buyer_org_id: orgId,
    order_type: input.order_type,
    record_count: recordCount,
    total_cents: totalCents,
    export_token: exportToken,
    current_period_end: currentPeriodEnd,
    status: 'pending',
  })

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
  await orderRepo.updateOrder(orderId, {
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
