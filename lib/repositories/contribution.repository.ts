import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  PoolContribution,
  InsertPoolContribution,
} from '@/types/database.types'

/** The current user's contributions (RLS-scoped). */
export async function findContributionsByUser(userId: string): Promise<PoolContribution[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pool_contributions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Active contributions for a pool — buyer export path, service role. */
export async function findActiveContributionsByPool(poolId: string): Promise<PoolContribution[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pool_contributions')
    .select('*')
    .eq('pool_id', poolId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Count of active contributions for a pool — service role. */
export async function countActiveContributions(poolId: string): Promise<number> {
  const service = createServiceClient()
  const { count, error } = await service
    .from('pool_contributions')
    .select('id', { count: 'exact', head: true })
    .eq('pool_id', poolId)
    .eq('status', 'active')
  if (error) throw error
  return count ?? 0
}

export async function createContribution(
  contribution: InsertPoolContribution
): Promise<PoolContribution> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pool_contributions')
    .insert(contribution)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function withdrawContribution(id: string, userId: string): Promise<PoolContribution> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pool_contributions')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data
}
