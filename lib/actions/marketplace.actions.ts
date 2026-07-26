'use server'

import { createClient } from '@/lib/supabase/server'
import {
  requireDataBuyer,
  requireOrgMembership,
  requireVerifiedDataBuyer,
} from '@/lib/middleware/withOrgMember'
import {
  listOpenPools,
  getOpenPool,
  listOrgPools,
  createPoolForOrg,
  closePool,
  getMarketSupply,
  type MarketSupplyRow,
  type OpenDataPool,
} from '@/lib/services/marketplace.service'
import { createPoolSchema } from '@/lib/validations/marketplace'
import { evaluatePool, type PoolEvaluation } from '@/lib/services/pool-evaluation.service'
import type { DataPool } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getOpenPoolsAction(category?: string): Promise<OpenDataPool[]> {
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
  await requireVerifiedDataBuyer(orgId)
  return getMarketSupply()
}

export async function createPoolAction(orgId: string, input: unknown): Promise<DataPool> {
  const userId = await getAuthenticatedUserId()
  await requireVerifiedDataBuyer(orgId)
  const parsed = createPoolSchema.parse(input)
  return createPoolForOrg(orgId, userId, parsed)
}

export async function closePoolAction(orgId: string, poolId: string): Promise<DataPool> {
  const userId = await getAuthenticatedUserId()
  await requireDataBuyer(orgId)
  return closePool(poolId, orgId, userId)
}

/**
 * LD-503: what a buyer would actually receive, before they pay for it.
 *
 * Scoped to the owning organization, because coverage and cohort size for
 * somebody else's pool are not public facts.
 */
export async function evaluatePoolAction(
  orgId: string,
  poolId: string
): Promise<PoolEvaluation> {
  await requireDataBuyer(orgId)
  return evaluatePool(poolId, orgId)
}
