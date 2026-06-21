'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  listOpenPools,
  getOpenPool,
  listOrgPools,
  createPoolForOrg,
  closePool,
  getMarketSupply,
  type MarketSupplyRow,
} from '@/lib/services/marketplace.service'
import { createPoolSchema } from '@/lib/validations/marketplace'
import type { DataPool } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/** Assert the user belongs to the org and the org has the data-buyer capability. */
async function requireDataBuyer(orgId: string) {
  const membership = await requireOrgMembership(orgId)
  if (!membership.organization.data_buyer) {
    throw new Error('This organization is not enabled for data purchasing')
  }
  return membership
}

export async function getOpenPoolsAction(category?: string): Promise<DataPool[]> {
  await getAuthenticatedUserId()
  return listOpenPools(category)
}

export async function getOpenPoolAction(id: string): Promise<DataPool | null> {
  await getAuthenticatedUserId()
  return getOpenPool(id)
}

export async function getOrgPoolsAction(orgId: string): Promise<DataPool[]> {
  await requireOrgMembership(orgId)
  return listOrgPools(orgId)
}

export async function getMarketSupplyAction(orgId: string): Promise<MarketSupplyRow[]> {
  await requireDataBuyer(orgId)
  return getMarketSupply()
}

export async function createPoolAction(orgId: string, input: unknown): Promise<DataPool> {
  const userId = await getAuthenticatedUserId()
  await requireDataBuyer(orgId)
  const parsed = createPoolSchema.parse(input)
  return createPoolForOrg(orgId, userId, parsed)
}

export async function closePoolAction(orgId: string, poolId: string): Promise<DataPool> {
  const userId = await getAuthenticatedUserId()
  await requireDataBuyer(orgId)
  return closePool(poolId, orgId, userId)
}
