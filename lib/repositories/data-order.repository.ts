import { createServiceClient } from '@/lib/supabase/service'
import type {
  DataOrder,
  DataOrderRecord,
  InsertDataOrder,
  InsertDataOrderRecord,
  UpdateDataOrder,
} from '@/types/database.types'

export async function createOrder(order: InsertDataOrder): Promise<DataOrder> {
  const service = createServiceClient()
  const { data, error } = await service.from('data_orders').insert(order).select('*').single()
  if (error) throw error
  return data
}

export async function updateOrder(id: string, patch: UpdateDataOrder): Promise<DataOrder> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_orders')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteOrder(id: string): Promise<void> {
  const service = createServiceClient()
  const { error } = await service.from('data_orders').delete().eq('id', id)
  if (error) throw error
}

export async function createOrderRecords(
  records: InsertDataOrderRecord[]
): Promise<DataOrderRecord[]> {
  if (records.length === 0) return []
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_order_records')
    .insert(records)
    .select('*')
  if (error) throw error
  return data
}

export async function findOrderRecords(orderId: string): Promise<DataOrderRecord[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_order_records')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function findOrderById(id: string): Promise<DataOrder | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('data_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle()
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
