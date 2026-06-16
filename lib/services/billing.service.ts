import { createServiceClient } from '@/lib/supabase/service'
import type { Json, OrgSubscription } from '@/types/database.types'

export type Plan = OrgSubscription['plan']
export type UsageEventType = 'credential_issued' | 'credential_verified'

/** Monthly issuance allowance per plan. */
export const PLAN_ISSUANCE_LIMIT: Record<Plan, number> = {
  free: 50,
  starter: 1_000,
  growth: 25_000,
  enterprise: Number.MAX_SAFE_INTEGER,
}

export interface UsageSummary {
  plan: Plan
  issuanceLimit: number
  issuedThisMonth: number
  verifiedThisMonth: number
}

function startOfMonthISO(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Record a metered event (best-effort; never blocks the primary operation). */
export async function recordUsage(
  organizationId: string,
  eventType: UsageEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  const service = createServiceClient()
  await service
    .from('usage_events')
    .insert({ organization_id: organizationId, event_type: eventType, metadata: (metadata as Json) ?? null })
}

/** Return the org's subscription, creating a default free plan on first access. */
export async function getOrCreateSubscription(organizationId: string): Promise<OrgSubscription> {
  const service = createServiceClient()
  const { data: existing } = await service
    .from('org_subscriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (existing) return existing as OrgSubscription

  const { data, error } = await service
    .from('org_subscriptions')
    .insert({ organization_id: organizationId, plan: 'free' })
    .select('*')
    .single()
  if (error) throw error
  return data as OrgSubscription
}

async function countUsage(organizationId: string, eventType: UsageEventType): Promise<number> {
  const service = createServiceClient()
  const { count, error } = await service
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('event_type', eventType)
    .gte('created_at', startOfMonthISO())
  if (error) throw error
  return count ?? 0
}

export async function getUsageSummary(organizationId: string): Promise<UsageSummary> {
  const subscription = await getOrCreateSubscription(organizationId)
  const [issuedThisMonth, verifiedThisMonth] = await Promise.all([
    countUsage(organizationId, 'credential_issued'),
    countUsage(organizationId, 'credential_verified'),
  ])
  return {
    plan: subscription.plan,
    issuanceLimit: PLAN_ISSUANCE_LIMIT[subscription.plan],
    issuedThisMonth,
    verifiedThisMonth,
  }
}

/** Throws if the org has hit its monthly issuance limit for its plan. */
export async function assertIssuanceQuota(organizationId: string): Promise<void> {
  const subscription = await getOrCreateSubscription(organizationId)
  const limit = PLAN_ISSUANCE_LIMIT[subscription.plan]
  if (limit === Number.MAX_SAFE_INTEGER) return
  const issued = await countUsage(organizationId, 'credential_issued')
  if (issued >= limit) {
    throw new Error(`Monthly issuance limit reached for the ${subscription.plan} plan (${limit}). Upgrade to issue more.`)
  }
}
