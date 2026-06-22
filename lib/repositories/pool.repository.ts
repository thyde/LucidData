import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { DataPool, InsertDataPool, UpdateDataPool } from '@/types/database.types'

/** Open pools any authenticated individual can browse and contribute to (RLS). */
export async function findOpenPools(category?: string): Promise<DataPool[]> {
  const supabase = await createClient()
  let query = supabase
    .from('data_pools')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) throw error
  return data
}

/** A single open pool by id (RLS-visible only while open). */
export async function findOpenPoolById(id: string): Promise<DataPool | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('data_pools')
    .select('*')
    .eq('id', id)
    .eq('status', 'open')
    .maybeSingle()
  if (error) throw error
  return data
}

/** All pools for an org (incl. closed) — buyer-side, service role. */
export async function findPoolsByOrg(orgId: string): Promise<DataPool[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_pools')
    .select('*')
    .eq('buyer_org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** A pool scoped to its owning org — buyer-side, service role. */
export async function findPoolByOrg(id: string, orgId: string): Promise<DataPool | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_pools')
    .select('*')
    .eq('id', id)
    .eq('buyer_org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data
}

// A pool by id regardless of status or owning org. For internal flows that only
// hold a pool_id (e.g. payout notifications), not for buyer/contributor reads.
export async function findPoolById(id: string): Promise<DataPool | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_pools')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createPool(pool: InsertDataPool): Promise<DataPool> {
  const service = createServiceClient()
  const { data, error } = await service.from('data_pools').insert(pool).select('*').single()
  if (error) throw error
  return data
}

export async function updatePool(id: string, orgId: string, updates: UpdateDataPool): Promise<DataPool> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_pools')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('buyer_org_id', orgId)
    .select('*')
    .single()
  if (error) throw error
  return data
}
