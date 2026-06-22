import type Stripe from 'stripe'
import * as payoutRepo from '@/lib/repositories/payout.repository'
import * as contributionRepo from '@/lib/repositories/contribution.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { createAuditEntry } from '@/lib/services/audit.service'
import {
  notifyDataSold,
  notifyPayoutPaid,
} from '@/lib/services/marketplace-notification.service'
import type { DataOrder, Payout, PayoutAccount } from '@/types/database.types'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

export interface PayoutOverview {
  connected: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  paidCents: number
  pendingCents: number
  payouts: Payout[]
}

/** Ensure the user has a Stripe Express connected account; returns the local row. */
async function ensureConnectAccount(
  userId: string,
  email: string | null
): Promise<PayoutAccount> {
  const existing = await payoutRepo.findAccount(userId)
  if (existing) return existing

  const account = await getStripe().accounts.create({
    type: 'express',
    email: email ?? undefined,
    capabilities: { transfers: { requested: true } },
    metadata: { userId },
  })

  return payoutRepo.upsertAccount({
    user_id: userId,
    stripe_account_id: account.id,
    details_submitted: account.details_submitted ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
  })
}

/** Create a Stripe-hosted onboarding link for the user's payout account. */
export async function createOnboardingLink(
  userId: string,
  email: string | null
): Promise<string> {
  const account = await ensureConnectAccount(userId, email)
  const link = await getStripe().accountLinks.create({
    account: account.stripe_account_id,
    type: 'account_onboarding',
    return_url: `${appUrl()}/marketplace?payouts=ready`,
    refresh_url: `${appUrl()}/marketplace?payouts=refresh`,
  })
  return link.url
}

/** Pull the latest status from Stripe and flush pending payouts once enabled. */
export async function refreshConnectStatus(userId: string): Promise<PayoutAccount | null> {
  const account = await payoutRepo.findAccount(userId)
  if (!account) return null

  const stripeAccount = await getStripe().accounts.retrieve(account.stripe_account_id)
  const updated = await payoutRepo.updateAccount(userId, {
    details_submitted: stripeAccount.details_submitted ?? false,
    payouts_enabled: stripeAccount.payouts_enabled ?? false,
    updated_at: new Date().toISOString(),
  })
  if (updated.payouts_enabled) await processPendingPayouts(userId)
  return updated
}

/** Webhook: account.updated -> sync status and flush any pending payouts. */
export async function syncConnectAccount(account: Stripe.Account): Promise<void> {
  const local = await payoutRepo.findAccountByStripeId(account.id)
  if (!local) return
  const updated = await payoutRepo.updateAccount(local.user_id, {
    details_submitted: account.details_submitted ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    updated_at: new Date().toISOString(),
  })
  if (updated.payouts_enabled) await processPendingPayouts(local.user_id)
}

/** Record per-contribution payouts for a paid data order, then pay onboarded users. */
export async function recordOrderPayouts(order: DataOrder): Promise<void> {
  const existing = await payoutRepo.findPayoutsByOrder(order.id)
  if (existing.length > 0) return // idempotent across webhook redeliveries

  const pool = await poolRepo.findPoolById(order.pool_id)
  const poolName = pool?.name ?? 'a data pool'

  const contributions = await contributionRepo.findActiveContributionsByPool(order.pool_id)
  const userIds = new Set<string>()
  for (const c of contributions) {
    if (c.payout_cents <= 0) continue
    await payoutRepo.createPayout({
      user_id: c.user_id,
      contribution_id: c.id,
      data_order_id: order.id,
      pool_id: order.pool_id,
      amount_cents: c.payout_cents,
      status: 'pending',
    })
    await notifyDataSold(c.user_id, {
      poolName,
      amountCents: c.payout_cents,
      orderId: order.id,
    })
    userIds.add(c.user_id)
  }

  for (const userId of userIds) {
    await processPendingPayouts(userId).catch((e) =>
      console.error('payout processing failed for', userId, e)
    )
  }
}

/** Transfer all pending payouts for a user whose connected account can receive them. */
export async function processPendingPayouts(userId: string): Promise<void> {
  if (!isStripeConfigured()) return
  const account = await payoutRepo.findAccount(userId)
  if (!account || !account.payouts_enabled) return

  const pending = await payoutRepo.findPendingPayouts(userId)
  const poolNames = new Map<string, string>()
  for (const payout of pending) {
    try {
      const transfer = await getStripe().transfers.create({
        amount: payout.amount_cents,
        currency: 'usd',
        destination: account.stripe_account_id,
        metadata: { payoutId: payout.id, userId },
      })
      await payoutRepo.updatePayout(payout.id, {
        status: 'paid',
        stripe_transfer_id: transfer.id,
      })
      await createAuditEntry({
        userId,
        eventType: 'payout_sent',
        action: `Received a payout of $${(payout.amount_cents / 100).toFixed(2)}`,
        metadata: { payout_id: payout.id, amount_cents: payout.amount_cents },
      })
      let poolName = poolNames.get(payout.pool_id)
      if (poolName === undefined) {
        const pool = await poolRepo.findPoolById(payout.pool_id)
        poolName = pool?.name ?? 'a data pool'
        poolNames.set(payout.pool_id, poolName)
      }
      await notifyPayoutPaid(userId, {
        poolName,
        amountCents: payout.amount_cents,
        payoutId: payout.id,
      })
    } catch (e) {
      // Leave the payout 'pending' so a transient issue (settling balance, capability
      // still propagating) retries on the next refresh or account.updated event.
      console.error('Stripe transfer failed for payout', payout.id, e)
    }
  }
}

export async function getPayoutOverview(userId: string): Promise<PayoutOverview> {
  // Refresh from Stripe so a just-completed onboarding reflects immediately.
  let account = await payoutRepo.findAccount(userId)
  if (account && !account.payouts_enabled && isStripeConfigured()) {
    account = await refreshConnectStatus(userId)
  }

  const payouts = await payoutRepo.findPayoutsByUser(userId)
  let paidCents = 0
  let pendingCents = 0
  for (const p of payouts) {
    if (p.status === 'paid') paidCents += p.amount_cents
    else if (p.status === 'pending') pendingCents += p.amount_cents
  }

  return {
    connected: Boolean(account),
    payoutsEnabled: account?.payouts_enabled ?? false,
    detailsSubmitted: account?.details_submitted ?? false,
    paidCents,
    pendingCents,
    payouts,
  }
}
