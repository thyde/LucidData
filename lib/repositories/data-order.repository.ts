import { createServiceClient } from '@/lib/supabase/service'
import type { DataOrder, InsertDataOrder } from '@/types/database.types'

export async function createOrder(order: InsertDataOrder): Promise<DataOrder> {
  const service = createServiceClient()
  const { data, error } = await service.from('data_orders').insert(order).select('*').single()
  if (error) throw error
  return data
}

export async function findOrdersByOrg(orgId: string): Promise<DataOrder[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_orders')
    .select('*')
    .eq('buyer_org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function findOrderByToken(token: string): Promise<DataOrder | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_orders')
    .select('*')
    .eq('export_token', token)
    .maybeSingle()
  if (error) throw error
  return data
}
