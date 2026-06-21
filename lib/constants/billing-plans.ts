import type { OrgSubscription } from '@/types/database.types'

// Org subscription plans and their Stripe pricing. This module is safe to import
// from Client Components: it only reads `process.env` inside server-invoked
// helpers and otherwise exports plain data.

export type Plan = OrgSubscription['plan']

export interface PlanDefinition {
  plan: Plan
  name: string
  /** Monthly price in USD cents. 0 for free, null for custom/contact-sales. */
  amountCents: number | null
  /** Whether a customer can self-serve checkout into this plan. */
  selfServe: boolean
  /** Env var holding the recurring monthly Stripe price id for this plan. */
  priceEnvVar?: 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_GROWTH'
  description: string
}

export const PLAN_CATALOG: Record<Plan, PlanDefinition> = {
  free: {
    plan: 'free',
    name: 'Free',
    amountCents: 0,
    selfServe: false,
    description: '50 credential issuances per month',
  },
  starter: {
    plan: 'starter',
    name: 'Starter',
    amountCents: 4900,
    selfServe: true,
    priceEnvVar: 'STRIPE_PRICE_STARTER',
    description: '1,000 issuances per month',
  },
  growth: {
    plan: 'growth',
    name: 'Growth',
    amountCents: 29900,
    selfServe: true,
    priceEnvVar: 'STRIPE_PRICE_GROWTH',
    description: '25,000 issuances per month',
  },
  enterprise: {
    plan: 'enterprise',
    name: 'Enterprise',
    amountCents: null,
    selfServe: false,
    description: 'Unlimited issuances and custom terms',
  },
}

/** Plans a customer can upgrade to through self-serve Stripe Checkout. */
export const SELF_SERVE_PLANS: Plan[] = Object.values(PLAN_CATALOG)
  .filter((def) => def.selfServe)
  .map((def) => def.plan)

/** Resolve the configured Stripe price id for a self-serve plan (server-side). */
export function priceIdForPlan(plan: Plan): string | null {
  const def = PLAN_CATALOG[plan]
  if (!def.priceEnvVar) return null
  return process.env[def.priceEnvVar] ?? null
}

/** Reverse-map a Stripe price id back to a plan (server-side). */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null
  for (const def of Object.values(PLAN_CATALOG)) {
    if (def.priceEnvVar && process.env[def.priceEnvVar] === priceId) return def.plan
  }
  return null
}

/** Format USD cents for display, e.g. 4900 -> "$49", null -> "Custom". */
export function formatPlanPrice(amountCents: number | null): string {
  if (amountCents === null) return 'Custom'
  if (amountCents === 0) return 'Free'
  const dollars = amountCents / 100
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`
}
