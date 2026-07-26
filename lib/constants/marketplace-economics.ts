/**
 * LD-505 marketplace economics.
 *
 * The old model kept a fixed access fee as the only margin while the payment
 * processor took a percentage of the whole transaction, so every category had a
 * pool size beyond which a sale lost money, and two categories lost money on
 * every sale. Success made it worse, which inverted the incentive behind every
 * spec that grows pools.
 *
 * The fix is a percentage platform fee, so cost and revenue scale together, plus
 * a minimum order value and a payout threshold that stop small transactions
 * being eaten by fixed processing costs.
 *
 * These are the validated parameters. Keep them here, in one typed module, so
 * they cannot drift between the pricing guidance, the order path, and payouts.
 */

/** Share of gross that LucidData retains, in basis points. */
export const PLATFORM_FEE_BPS = 2500

/**
 * Smallest order LucidData will accept. The arithmetic floor for profitability
 * is far lower; this also matches how buyers actually purchase, since a handful
 * of records is not a useful dataset.
 */
export const MINIMUM_ORDER_CENTS = 5000

/**
 * Contributors accrue earnings and are paid once the balance clears this.
 * Paying out every few cents costs more than it moves.
 */
export const PAYOUT_THRESHOLD_CENTS = 2500

/**
 * External assumption: US standard card pricing. Used only to check that an
 * order can cover its own processing, never to charge the buyer.
 */
export const PROCESSING_PERCENT_BPS = 290
export const PROCESSING_FIXED_CENTS = 30

/** What LucidData retains from a gross amount. */
export function platformFeeCents(grossCents: number, feeBps = PLATFORM_FEE_BPS): number {
  if (grossCents <= 0) return 0
  return Math.round((grossCents * feeBps) / 10_000)
}

/** What the contributor receives after the platform fee. */
export function contributorNetCents(grossCents: number, feeBps = PLATFORM_FEE_BPS): number {
  return Math.max(0, grossCents - platformFeeCents(grossCents, feeBps))
}

/** Estimated payment-processing cost for an order total. */
export function processingCostCents(totalCents: number): number {
  if (totalCents <= 0) return 0
  return Math.round((totalCents * PROCESSING_PERCENT_BPS) / 10_000) + PROCESSING_FIXED_CENTS
}

/**
 * What LucidData nets on an order after paying contributors and the processor.
 * Positive at every category and pool size once the percentage fee applies.
 */
export function orderMarginCents(totalCents: number, feeBps = PLATFORM_FEE_BPS): number {
  return platformFeeCents(totalCents, feeBps) - processingCostCents(totalCents)
}

export function isOrderProfitable(totalCents: number, feeBps = PLATFORM_FEE_BPS): boolean {
  return orderMarginCents(totalCents, feeBps) > 0
}

export class MinimumOrderError extends Error {
  constructor(totalCents: number) {
    super(
      `This dataset comes to $${(totalCents / 100).toFixed(2)}. The minimum order is $${(
        MINIMUM_ORDER_CENTS / 100
      ).toFixed(2)}. Widen the pool or raise the price per record.`
    )
    this.name = 'MinimumOrderError'
  }
}

/** Refuse an order that cannot cover its own cost. Free datasets are exempt. */
export function assertOrderMeetsMinimum(totalCents: number): void {
  if (totalCents <= 0) return
  if (totalCents < MINIMUM_ORDER_CENTS) throw new MinimumOrderError(totalCents)
}

export interface EarningsSplit {
  grossCents: number
  platformFeeCents: number
  netCents: number
  feeBps: number
}

/**
 * The three numbers a contributor must see before consenting and on every
 * payout: what the buyer paid, what LucidData took, and what they receive.
 */
export function splitEarnings(grossCents: number, feeBps = PLATFORM_FEE_BPS): EarningsSplit {
  const fee = platformFeeCents(grossCents, feeBps)
  return {
    grossCents,
    platformFeeCents: fee,
    netCents: Math.max(0, grossCents - fee),
    feeBps,
  }
}

export function formatFeePercent(feeBps = PLATFORM_FEE_BPS): string {
  return `${feeBps / 100}%`
}
