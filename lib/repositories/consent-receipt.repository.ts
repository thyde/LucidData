import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { ConsentReceipt, InsertConsentReceipt } from '@/types/database.types'

/**
 * Consent receipts are append-only. There is no update or delete path here by
 * design: a change of state emits a new receipt that supersedes the old one.
 */
export async function insertReceipt(input: InsertConsentReceipt): Promise<ConsentReceipt> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('consent_receipts')
    .insert(input)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** The most recent receipt for a consent, used to chain the next one. */
export async function findLatestReceiptForConsent(
  consentId: string
): Promise<ConsentReceipt | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('consent_receipts')
    .select('*')
    .eq('consent_id', consentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Public lookup by receipt id, for the unauthenticated verification page. */
export async function findReceiptById(id: string): Promise<ConsentReceipt | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('consent_receipts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Receipts the caller may read, resolved by RLS (subject or named recipient). */
export async function findReceiptsForConsent(consentId: string): Promise<ConsentReceipt[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consent_receipts')
    .select('*')
    .eq('consent_id', consentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Every receipt the caller may read, newest first. */
export async function findReceiptsForUser(userId: string): Promise<ConsentReceipt[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consent_receipts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
