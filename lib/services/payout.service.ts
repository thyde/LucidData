import type Stripe from 'stripe'
import * as payoutRepo from '@/lib/repositories/payout.repository'
import * as orderRepo from '@/lib/repositories/data-order.repository'
import * as poolRepo from '@/lib/repositories/pool.repository'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { createAuditEntry } from '@/lib/services/audit.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import { payoutTransferGroup, payoutTransferKey, transferRefused } from '@/lib/utils/payout-transfer'
import {
  notifyDataSold,
  notifyPayoutPaid,
} from '@/lib/services/marketplace-notification.service'
import {
  PAYOUT_THRESHOLD_CENTS,
  PLATFORM_FEE_BPS,
  splitEarnings,
} from '@/lib/constants/marketplace-economics'
import {
  holdPayoutsForReview,
  shouldHoldPayout,
} from '@/lib/services/marketplace-integrity.service'
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
  /** LD-506: owed, but waiting for a review before it is sent. */
  heldCents: number
  /** Total the buyers paid for this contributor's records, before the fee. */
  grossCents: number
  /** Total LucidData retained. */
  platformFeeCents: number
  /** Balance still needed before the next transfer is sent. */
  thresholdCents: number
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

/**
 * Send a payout's transfer, or return the one an earlier attempt already sent.
 * Every transfer for a payout carries its transfer group, so an attempt whose
 * answer was lost to a timeout or a server error is found here rather than
 * sent again, even after Stripe has forgotten the idempotency key.
 */
export async function sendPayoutTransfer(
  payout: Pick<Payout, 'id' | 'attempts' | 'amount_cents' | 'user_id'>,
  destination: string
): Promise<{ id: string }> {
  const stripe = getStripe()
  const group = payoutTransferGroup(payout)
  const earlier = await stripe.transfers.list({ transfer_group: group, limit: 1 })
  if (earlier.data.length > 0) return earlier.data[0]
  return stripe.transfers.create(
    {
      amount: payout.amount_cents,
      currency: 'usd',
      destination,
      transfer_group: group,
      metadata: { payoutId: payout.id, userId: payout.user_id },
    },
    { idempotencyKey: payoutTransferKey(payout) }
  )
}

/** Record per-contribution payouts for a paid data order, then pay onboarded users. */
export async function recordOrderPayouts(order: DataOrder): Promise<void> {
  const existing = await payoutRepo.findPayoutsByOrder(order.id)
  if (existing.length > 0) return // idempotent across webhook redeliveries

  const pool = await poolRepo.findPoolById(order.pool_id)
  const poolName = pool?.name ?? 'a data pool'
  // The buyer paid the pool's price for each record, and a payout comes out of
  // that. An order snapshotted before releases were capped can hold a record
  // worth more, so the cap is applied again here, where the money is owed.
  const pricePerRecordCents = pool?.price_per_record_cents ?? 0

  const records = await orderRepo.findOrderRecords(order.id)
  const userIds = new Set<string>()
  for (const record of records) {
    const grossCents = Math.min(record.payout_cents, pricePerRecordCents)
    if (!record.source_user_id || grossCents <= 0) continue
    // LD-505: the fee is taken here, from the gross the buyer paid, and all three
    // numbers are recorded so the contributor sees what happened.
    const split = splitEarnings(grossCents, PLATFORM_FEE_BPS)
    await payoutRepo.createPayout({
      user_id: record.source_user_id,
      contribution_id: record.source_contribution_id,
      data_order_id: order.id,
      pool_id: order.pool_id,
      gross_cents: split.grossCents,
      platform_fee_cents: split.platformFeeCents,
      fee_bps: split.feeBps,
      amount_cents: split.netCents,
      status: 'pending',
    })
    await notifyDataSold(record.source_user_id, {
      poolName,
      amountCents: split.netCents,
      orderId: order.id,
    })
    userIds.add(record.source_user_id)
  }

  for (const userId of userIds) {
    await processPendingPayouts(userId).catch((e) =>
      console.error('payout processing failed for', userId, e)
    )
  }
}

/**
 * Transfer pending payouts for a user whose connected account can receive them.
 *
 * LD-505: earnings accrue in the ledger and only move once the balance clears
 * the threshold, because sending a few cents costs several times what it moves.
 * `force` overrides that, and is used when an account closes: a balance is owed
 * on demand and must never expire.
 */
export async function processPendingPayouts(
  userId: string,
  options: { force?: boolean } = {}
): Promise<void> {
  if (!isStripeConfigured()) return
  const account = await payoutRepo.findAccount(userId)
  if (!account || !account.payouts_enabled) return

  // A held balance is invisible to a normal run, which is the point. Closure is
  // the exception: the money is owed on demand, so the hold must not outlive the
  // account.
  const pending = await payoutRepo.findPendingPayouts(userId, {
    includeHeld: options.force === true,
  })
  const balance = pending.reduce((sum, payout) => sum + payout.amount_cents, 0)
  if (!options.force && balance < PAYOUT_THRESHOLD_CENTS) return

  // LD-506: the last point at which a payout can be stopped. A balance this far
  // above what an ordinary contributor earns waits for a person to look at it.
  // `force` is account closure, where the balance is owed on demand, so a hold
  // there would be withholding money we have no further claim on.
  if (!options.force && shouldHoldPayout(balance)) {
    await holdPayoutsForReview(
      userId,
      pending.map((payout) => payout.id),
      balance
    )
    return
  }

  const poolNames = new Map<string, string>()
  for (const payout of pending) {
    let transferId: string | null = null
    try {
      const transfer = await sendPayoutTransfer(payout, account.stripe_account_id)
      transferId = transfer.id
      await payoutRepo.updatePayout(payout.id, {
        status: 'paid',
        stripe_transfer_id: transfer.id,
      })
    } catch (e) {
      if (transferId) {
        // The money moved but the record did not. The payout is left exactly as
        // it was, so the next attempt repeats this request and records the same
        // transfer rather than sending another.
        errorLogger.log(e, ErrorSeverity.CRITICAL, {
          userId,
          action: 'PAYOUT_SENT_NOT_RECORDED',
          resource: 'payout',
          metadata: { payoutId: payout.id, transferId },
        })
        continue
      }
      // Leave the payout 'pending' so a transient issue (settling balance, capability
      // still propagating) retries on the next refresh or account.updated event.
      // A refusal is counted, which gives the retry a new idempotency key so
      // Stripe does not answer it with the same refusal. An unknown outcome is
      // not: the retry repeats this request and finds the transfer if it exists.
      if (transferRefused(e)) {
        try {
          await payoutRepo.updatePendingPayout(payout.id, payout.attempts, {
            attempts: payout.attempts + 1,
            last_error: (e instanceof Error ? e.message : 'Transfer failed').slice(0, 500),
          })
        } catch {
          // Unrecorded, the next try repeats this request and gets the same answer.
        }
      }
      errorLogger.log(e, ErrorSeverity.MEDIUM, {
        userId,
        action: 'PAYOUT_TRANSFER_FAILED',
        resource: 'payout',
        metadata: { payoutId: payout.id },
      })
      continue
    }

    // The payout is paid and recorded. What follows only tells people, and a
    // failure here must never send it round again.
    try {
      await createAuditEntry({
        userId,
        eventType: 'payout_sent',
        action: `Received a payout of $${(payout.amount_cents / 100).toFixed(2)}`,
        metadata: { payout_id: payout.id, amount_cents: payout.amount_cents },
      })
    } catch (e) {
      errorLogger.log(e, ErrorSeverity.MEDIUM, { userId, action: 'PAYOUT_AUDIT_FAILED', metadata: { payoutId: payout.id } })
    }
    try {
      let poolName = 'a data pool'
      if (payout.pool_id) {
        poolName = poolNames.get(payout.pool_id) ?? ''
        if (!poolName) {
          const pool = await poolRepo.findPoolById(payout.pool_id)
          poolName = pool?.name ?? 'a data pool'
          poolNames.set(payout.pool_id, poolName)
        }
      }
      await notifyPayoutPaid(userId, {
        poolName,
        amountCents: payout.amount_cents,
        payoutId: payout.id,
      })
    } catch (e) {
      errorLogger.log(e, ErrorSeverity.LOW, { userId, action: 'PAYOUT_NOTICE_FAILED', metadata: { payoutId: payout.id } })
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
  let heldCents = 0
  let grossCents = 0
  let platformFeeCents = 0
  for (const p of payouts) {
    if (p.status === 'paid') paidCents += p.amount_cents
    else if (p.status === 'pending') pendingCents += p.amount_cents
    else if (p.status === 'held') heldCents += p.amount_cents
    grossCents += p.gross_cents
    platformFeeCents += p.platform_fee_cents
  }

  return {
    connected: Boolean(account),
    payoutsEnabled: account?.payouts_enabled ?? false,
    detailsSubmitted: account?.details_submitted ?? false,
    paidCents,
    pendingCents,
    heldCents,
    grossCents,
    platformFeeCents,
    thresholdCents: PAYOUT_THRESHOLD_CENTS,
    payouts,
  }
}

/**
 * Pay out whatever is owed regardless of the threshold. Used when an account is
 * closing: an outstanding balance is owed on demand and must never expire.
 */
export async function flushOwedBalance(userId: string): Promise<void> {
  await processPendingPayouts(userId, { force: true })
}
