'use server'

import { createClient } from '@/lib/supabase/server'
import {
  listMyContributions,
  contribute,
  withdraw,
  getEarnings,
  type EarningsSummary,
} from '@/lib/services/contribution.service'
import { contributeSchema } from '@/lib/validations/marketplace'
import type { PoolContribution } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getMyContributionsAction(): Promise<PoolContribution[]> {
  const userId = await getAuthenticatedUserId()
  return listMyContributions(userId)
}

export async function contributeAction(input: unknown): Promise<PoolContribution> {
  const userId = await getAuthenticatedUserId()
  const parsed = contributeSchema.parse(input)
  return contribute(userId, parsed)
}

export async function withdrawContributionAction(id: string): Promise<PoolContribution> {
  const userId = await getAuthenticatedUserId()
  return withdraw(id, userId)
}

export async function getEarningsAction(): Promise<EarningsSummary> {
  const userId = await getAuthenticatedUserId()
  return getEarnings(userId)
}
