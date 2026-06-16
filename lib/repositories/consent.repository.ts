import { createClient } from '@/lib/supabase/server'
import type { Consent, InsertConsent, UpdateConsent } from '@/types/database.types'

export async function findConsentsByUserId(userId: string): Promise<Consent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function findConsentById(id: string, userId: string): Promise<Consent | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function findActiveConsents(userId: string): Promise<Consent[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('consents')
    .select('*')
    .eq('user_id', userId)
    .eq('revoked', false)
    .or(`end_date.is.null,end_date.gt.${now}`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createConsent(consent: InsertConsent): Promise<Consent> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consents')
    .insert(consent)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateConsent(id: string, userId: string, updates: UpdateConsent): Promise<Consent> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function revokeConsent(id: string, userId: string, reason: string): Promise<Consent> {
  return updateConsent(id, userId, {
    revoked: true,
    revoked_at: new Date().toISOString(),
    revoked_reason: reason,
  })
}
