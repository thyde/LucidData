import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe } from '@/lib/stripe/client'
import { getOrCreateSubscription } from '@/lib/services/billing.service'
import { priceIdForPlan, planForPriceId, type Plan } from '@/lib/constants/billing-plans'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/** Ensure the org has a Stripe customer, persisting the id on its subscription row. */
async function ensureCustomer(organizationId: string): Promise<string> {
  const service = createServiceClient()
  const subscription = await getOrCreateSubscription(organizationId)
  if (subscription.stripe_customer_id) return subscription.stripe_customer_id

  const { data: org } = await service
    .from('organizations')
    .select('name, email')
    .eq('id', organizationId)
    .maybeSingle()

  const customer = await getStripe().customers.create({
    name: org?.name ?? undefined,
    email: org?.email ?? undefined,
    metadata: { organizationId },
  })

  await service
    .from('org_subscriptions')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)

  return customer.id
}

/** Create a Stripe Checkout session to subscribe the org to a paid plan. */
export async function createCheckoutSession(organizationId: string, plan: Plan): Promise<string> {
  const priceId = priceIdForPlan(plan)
  if (!priceId) {
    throw new Error(`No Stripe price is configured for the ${plan} plan.`)
  }
  const customerId = await ensureCustomer(organizationId)
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    metadata: { organizationId, plan },
    subscription_data: { metadata: { organizationId, plan } },
    success_url: `${appUrl()}/org/${organizationId}?billing=success`,
    cancel_url: `${appUrl()}/org/${organizationId}?billing=cancelled`,
  })
  if (!session.url) throw new Error('Stripe did not return a checkout URL.')
  return session.url
}

/** Create a Stripe Billing Portal session so an org can manage its subscription. */
export async function createBillingPortalSession(organizationId: string): Promise<string> {
  const subscription = await getOrCreateSubscription(organizationId)
  if (!subscription.stripe_customer_id) {
    throw new Error('This organization has no billing account yet. Upgrade to a paid plan first.')
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${appUrl()}/org/${organizationId}`,
  })
  return session.url
}

/** Map a Stripe subscription status to our org_subscriptions.status enum. */
function mapStatus(status: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    default:
      return 'canceled'
  }
}

/**
 * Read the current period end from a subscription. Stripe moved this field from
 * the subscription to its items across API versions, so we check both.
 */
function periodEndISO(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0] as { current_period_end?: number } | undefined
  const unix =
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    item?.current_period_end ??
    null
  return unix ? new Date(unix * 1000).toISOString() : null
}

/** Apply the current state of a Stripe subscription to org_subscriptions. */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const service = createServiceClient()
  const organizationId =
    (subscription.metadata?.organizationId as string | undefined) ?? null
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null
  const plan = planForPriceId(priceId)
  const status = mapStatus(subscription.status)

  const update: Record<string, unknown> = {
    status,
    stripe_subscription_id: subscription.id,
    current_period_end: periodEndISO(subscription),
    updated_at: new Date().toISOString(),
  }
  // When a plan is resolved, set it; canceled subscriptions fall back to free.
  if (status === 'canceled') update.plan = 'free'
  else if (plan) update.plan = plan

  if (organizationId) {
    await service.from('org_subscriptions').update(update).eq('organization_id', organizationId)
  } else if (subscription.customer) {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    await service.from('org_subscriptions').update(update).eq('stripe_customer_id', customerId)
  }
}
