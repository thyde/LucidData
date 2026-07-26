/**
 * LD-506 marketplace integrity parameters.
 *
 * Payouts are real money triggered by data the person asserts about themselves.
 * That combination is worth attacking: create several accounts, type plausible
 * records, contribute them to the same pool, and collect. Nothing structural
 * stopped that before this spec.
 *
 * Three controls, deliberately layered, because each fails differently:
 *
 *   duplicate  a unique index in the database, so it holds even if a caller
 *              forgets to check
 *   velocity   counted from the contributions themselves rather than a separate
 *              counter, so a broken cache cannot quietly disable it
 *   hold       a pause after the money is owed but before it moves
 *
 * Kept in one typed module so a limit cannot drift between the check that
 * enforces it and the copy that explains it.
 */

/**
 * How far back a velocity check looks.
 *
 * A day rather than an hour: contributing is a deliberate act, and someone
 * working through a backlog of records in one sitting is normal behaviour that
 * a short window would punish.
 */
export const VELOCITY_WINDOW_HOURS = 24

/**
 * Active contributions one person may make to a single pool per window.
 *
 * Set well above genuine use. A person with fifty relevant vault entries is
 * unusual but real; a person with five hundred in a day is not.
 */
export const MAX_CONTRIBUTIONS_PER_POOL_PER_WINDOW = 100

/** Active contributions one person may make across all pools per window. */
export const MAX_CONTRIBUTIONS_PER_WINDOW = 300

/**
 * Payout total above which a transfer waits for review.
 *
 * This is the last point at which a payout can be stopped, so the threshold is
 * low enough to catch a farmed balance and high enough that an ordinary
 * contributor never meets it. At the modelled earnings in section 7 of the
 * roadmap, a genuine contributor takes years to reach this.
 */
export const PAYOUT_REVIEW_THRESHOLD_CENTS = 20000

/** How a contribution's underlying vault entry is backed. */
export type AssuranceLevel = 'issuer_vouched' | 'provider_sourced' | 'self_asserted'

export interface AssuranceMix {
  issuerVouched: number
  providerSourced: number
  selfAsserted: number
}

export const ASSURANCE_LABEL: Record<AssuranceLevel, string> = {
  issuer_vouched: 'Vouched for by an issuer',
  provider_sourced: 'Imported from a connected source',
  self_asserted: 'Entered by the person',
}

/**
 * Share of a pool that an organization has vouched for, 0 to 1.
 *
 * Returns 0 for an empty pool rather than dividing by zero. A buyer reading
 * "0% verified" on an empty pool is being told something true.
 */
export function vouchedShare(mix: AssuranceMix): number {
  const total = mix.issuerVouched + mix.providerSourced + mix.selfAsserted
  if (total === 0) return 0
  return mix.issuerVouched / total
}
