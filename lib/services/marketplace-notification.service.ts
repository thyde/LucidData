// Marketplace earnings alerts for data contributors.
//
// Two distinct moments: a sale (a buyer purchased a pool you contributed to, so a
// payout was recorded) and a transfer (that payout was sent to your connected
// account). Each writes an in-app notification and a best-effort email routed to
// the marketplace page. Delivery never fails the payout flow that triggered it.
//
// Only metadata appears here (amounts, pool names). Never include vault contents,
// keys, or anonymized record payloads.

import { createNotification } from '@/lib/services/notification.service'
import { getUserEmail } from '@/lib/repositories/user.repository'

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export interface SaleNotification {
  poolName: string
  amountCents: number
  orderId?: string | null
}

export interface PayoutNotification {
  poolName: string
  amountCents: number
  payoutId?: string | null
}

/** A contributor's data in a pool was purchased and a payout was recorded. */
export async function notifyDataSold(
  userId: string,
  params: SaleNotification
): Promise<void> {
  try {
    const email = await getUserEmail(userId).catch(() => null)
    await createNotification({
      userId,
      type: 'marketplace_sale',
      title: 'Your data was purchased',
      message: `Your data in the "${params.poolName}" pool was purchased. You earned ${formatUsd(
        params.amountCents
      )}.`,
      relatedEntityId: params.orderId ?? null,
      relatedEntityType: 'payout',
      email,
    })
  } catch {
    // Best-effort: the payout ledger and audit log are the durable records.
  }
}

/** A payout transfer to the contributor's connected account succeeded. */
export async function notifyPayoutPaid(
  userId: string,
  params: PayoutNotification
): Promise<void> {
  try {
    const email = await getUserEmail(userId).catch(() => null)
    await createNotification({
      userId,
      type: 'marketplace_payout',
      title: 'You were paid',
      message: `A payout of ${formatUsd(params.amountCents)} for the "${
        params.poolName
      }" pool is on its way to your connected account.`,
      relatedEntityId: params.payoutId ?? null,
      relatedEntityType: 'payout',
      email,
    })
  } catch {
    // Best-effort: the payout ledger and audit log are the durable records.
  }
}
