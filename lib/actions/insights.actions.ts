'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getDataScore,
  getDataTracker,
  getDataMarket,
  type DataScore,
  type TrackerPoint,
  type CategoryCount,
} from '@/lib/services/data-insights.service'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getDataScoreAction(): Promise<DataScore> {
  const userId = await getAuthenticatedUserId()
  return getDataScore(userId)
}

export async function getDataTrackerAction(days?: number): Promise<TrackerPoint[]> {
  const userId = await getAuthenticatedUserId()
  return getDataTracker(userId, days)
}

export async function getDataMarketAction(): Promise<CategoryCount[]> {
  const userId = await getAuthenticatedUserId()
  return getDataMarket(userId)
}
