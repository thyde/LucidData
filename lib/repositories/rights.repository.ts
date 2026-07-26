import { createServiceClient } from '@/lib/supabase/service'
import type { RightsCase, RightsCaseEvent, InsertRightsCase } from '@/types/database.types'

/**
 * LD-301 rights case storage.
 *
 * Every read is scoped by userId even though RLS also applies. Cases move only
 * through the service role, because a person marking their own request fulfilled
 * would make the evidence trail worthless.
 */

export async function insertCase(row: InsertRightsCase): Promise<RightsCase> {
  const service = createServiceClient()
  const { data, error } = await service.from('rights_cases').insert(row).select('*').single()
  if (error) throw error
  return data as RightsCase
}

export async function findCaseById(id: string, userId: string): Promise<RightsCase | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rights_cases')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as RightsCase | null) ?? null
}

export async function findCasesByUser(userId: string): Promise<RightsCase[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rights_cases')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RightsCase[]
}

/** An open case of the same type, used to stop duplicate filings. */
export async function findOpenCaseOfType(
  userId: string,
  type: string
): Promise<RightsCase | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rights_cases')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .not('status', 'in', '("fulfilled","refused")')
    .maybeSingle()
  if (error) throw error
  return (data as RightsCase | null) ?? null
}

export async function updateCase(
  id: string,
  userId: string,
  patch: Partial<RightsCase>
): Promise<RightsCase> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rights_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data as RightsCase
}

export async function insertEvent(row: {
  case_id: string
  event: string
  actor: 'user' | 'operator' | 'system'
  detail?: string | null
}): Promise<RightsCaseEvent> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rights_case_events')
    .insert({ ...row, detail: row.detail ?? null })
    .select('*')
    .single()
  if (error) throw error
  return data as RightsCaseEvent
}

export async function findEventsByCase(caseId: string): Promise<RightsCaseEvent[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('rights_case_events')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as RightsCaseEvent[]
}
