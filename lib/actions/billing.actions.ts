'use server'

import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { getUsageSummary, type UsageSummary } from '@/lib/services/billing.service'
import {
  createCheckoutSession,
  createBillingPortalSession,
} from '@/lib/services/stripe-billing.service'
import { checkoutPlanSchema } from '@/lib/validations/billing'

export async function getBillingOverviewAction(organizationId: string): Promise<UsageSummary> {
  await requireOrgMembership(organizationId)
  return getUsageSummary(organizationId)
}

/** Start a Stripe Checkout session for an org owner to subscribe to a paid plan. */
export async function createCheckoutAction(
  organizationId: string,
  plan: string
): Promise<{ url: string }> {
  await requireOrgMembership(organizationId, ['owner'])
  const validPlan = checkoutPlanSchema.parse(plan)
  const url = await createCheckoutSession(organizationId, validPlan)
  return { url }
}

/** Open the Stripe Billing Portal for an org owner to manage their subscription. */
export async function createBillingPortalAction(
  organizationId: string
): Promise<{ url: string }> {
  await requireOrgMembership(organizationId, ['owner'])
  const url = await createBillingPortalSession(organizationId)
  return { url }
}
