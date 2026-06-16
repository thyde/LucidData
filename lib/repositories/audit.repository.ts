import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AuditLog, InsertAuditLog } from '@/types/database.types'

export async function findAuditLogsByUserId(userId: string, limit = 100): Promise<AuditLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function findLatestAuditLog(userId: string): Promise<AuditLog | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('current_hash')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as AuditLog | null
}

export async function createAuditLog(entry: InsertAuditLog): Promise<AuditLog> {
  // Use service role to bypass RLS (users cannot insert their own audit logs)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data
}
