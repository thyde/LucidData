'use server'

import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { getUsageSummary, type UsageSummary } from '@/lib/services/billing.service'

export async function getBillingOverviewAction(organizationId: string): Promise<UsageSummary> {
  await requireOrgMembership(organizationId)
  return getUsageSummary(organizationId)
}
