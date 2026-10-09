/** The Stripe error types that mean a request was refused and nothing was created. */
const REFUSED = new Set(['StripeCardError', 'StripeInvalidRequestError', 'StripePermissionError', 'StripeAuthenticationError'])

/**
 * The idempotency key for a payout's transfer, tied to the attempts recorded
 * so far. Only a refused attempt is recorded, so the next one is a new
 * request rather than a replay of the refusal. A transfer that went through
 * but could not be recorded, or an answer that never arrived, leaves the
 * count where it was, so the next try repeats the same request and Stripe
 * returns the same transfer. Stripe keeps a key for at least 24 hours, and
 * the transfer group covers the time after that.
 */
export function payoutTransferKey(payout: { id: string; attempts: number }): string {
  return `payout-${payout.id}-${payout.attempts}`
}

/** The transfer group every transfer for a payout carries, so an earlier one can be found. */
export function payoutTransferGroup(payout: { id: string }): string {
  return `payout-${payout.id}`
}

/**
 * Whether Stripe refused a transfer, so it certainly does not exist. A
 * timeout, a server error, a rate limit, or a clash with a request in flight
 * leaves the outcome unknown: the transfer may exist, and a retry must find it
 * rather than send another.
 */
export function transferRefused(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { type, statusCode } = error as { type?: unknown; statusCode?: unknown }
  return typeof type === 'string' && REFUSED.has(type) && statusCode !== 409 && statusCode !== 429
}
