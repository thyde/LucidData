import Stripe from 'stripe'

// Server-only Stripe client. Never import this from a Client Component; it would
// pull the Node SDK and the secret key path into the browser bundle.

let cached: Stripe | null = null

/** True when the server has a Stripe secret key configured. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Lazily construct the Stripe client. Throws if the secret key is missing so the
 * rest of the app can build and run with billing simply disabled.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to your environment to enable billing.'
    )
  }
  if (!cached) {
    cached = new Stripe(secretKey, { appInfo: { name: 'LucidData' } })
  }
  return cached
}
