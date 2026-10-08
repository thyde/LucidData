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

/** A contribution with the classification of the vault entry it came from, if it still exists. */
export type PoolContributionWithEntry = PoolContribution & {
  vault_data: { category: string; schema_type: string } | null
}

/**
 * Active contributions for a pool, for the buyer release and evaluation paths,
 * through the service role. The source entry's category and schema type come
 * along so restricted data can be recognised by what it is, not only by what
 * the contribution recorded. Nothing else from the entry is read.
 */
export async function findActiveContributionsByPool(
  poolId: string
): Promise<PoolContributionWithEntry[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pool_contributions')
    .select('*, vault_data(category, schema_type)')
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

/**
 * Contributions are written with the service role because API roles cannot
 * write this table. The payout, the payload, and the schema type all have to
 * come from the contribution service's checks, and a direct PostgREST write
 * would skip every one of them. The caller supplies the authenticated user id.
 */
export async function createContribution(
  contribution: InsertPoolContribution
): Promise<PoolContribution> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pool_contributions')
    .insert(contribution)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Service role for the same reason as createContribution; the user filter is the only scope. */
export async function withdrawContribution(id: string, userId: string): Promise<PoolContribution> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pool_contributions')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data
}
