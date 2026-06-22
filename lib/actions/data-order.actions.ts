'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  startPoolPurchase,
  listOrders,
  getExport,
  type StartPurchaseResult,
  type DatasetExport,
} from '@/lib/services/data-order.service'
import { purchasePoolSchema } from '@/lib/validations/marketplace'
import type { DataOrder } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

async function requireDataBuyer(orgId: string) {
  const membership = await requireOrgMembership(orgId)
  if (!membership.organization.data_buyer) {
    throw new Error('This organization is not enabled for data purchasing')
  }
  return membership
}

export async function purchasePoolAction(
  orgId: string,
  input: unknown
): Promise<StartPurchaseResult> {
  const userId = await getAuthenticatedUserId()
  await requireDataBuyer(orgId)
  const parsed = purchasePoolSchema.parse(input)
  return startPoolPurchase(orgId, userId, parsed)
}

export async function getOrdersAction(orgId: string): Promise<DataOrder[]> {
  await requireOrgMembership(orgId)
  return listOrders(orgId)
}

export async function getExportAction(orgId: string, token: string): Promise<DatasetExport> {
  const userId = await getAuthenticatedUserId()
  await requireDataBuyer(orgId)
  return getExport(orgId, userId, token)
}
