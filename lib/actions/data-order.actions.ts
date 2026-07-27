'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  requireOrgMembership,
  requireVerifiedDataBuyer,
} from '@/lib/middleware/withOrgMember'
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

export async function purchasePoolAction(
  orgId: string,
  input: unknown
): Promise<StartPurchaseResult | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await requireVerifiedDataBuyer(orgId)
    const parsed = purchasePoolSchema.parse(input)
    return startPoolPurchase(orgId, userId, parsed)  })
}

export async function getOrdersAction(orgId: string): Promise<DataOrder[] | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(orgId)
    return listOrders(orgId)  })
}

export async function getExportAction(orgId: string, token: string): Promise<DatasetExport | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await requireVerifiedDataBuyer(orgId)
    return getExport(orgId, userId, token)  })
}
