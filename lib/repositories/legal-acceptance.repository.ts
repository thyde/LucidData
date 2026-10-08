import { createClient } from '@/lib/supabase/server'
import type { LegalAcceptance } from '@/types/database.types'
import type { AcceptanceDocument } from '@/lib/constants/legal'

export interface AcceptanceInsert {
  user_id: string
  document: AcceptanceDocument
  version: string
  action?: 'accepted' | 'withdrawn'
  source: 'registration' | 'prompt' | 'settings' | 'health-gate' | 'organization-registration'
  organization_id?: string | null
  recorded_at?: string
}

/**
 * Append acceptance records as the signed-in person. Row level security allows
 * only their own rows, and only an owner may accept organization terms.
 */
export async function insertAcceptances(rows: AcceptanceInsert[]): Promise<void> {
  if (rows.length === 0) return
  const supabase = await createClient()
  const { error } = await supabase.from('legal_acceptances').insert(rows)
  if (error) throw error
}

/** Every record for a person, newest first. The table is small per person. */
export async function findAcceptancesByUser(userId: string): Promise<LegalAcceptance[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
