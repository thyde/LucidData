'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { ConsentRequest } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getConsentRequestsAction(): Promise<(ConsentRequest & { organization: { name: string; email: string } | null })[]> {
  const userId = await getAuthenticatedUserId()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('consent_requests')
    .select('*, organization:organizations(name, email)')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data as (ConsentRequest & { organization: { name: string; email: string } | null })[]
}

export async function respondToConsentRequestAction(
  requestId: string,
  response: 'approved' | 'denied',
  note?: string
): Promise<ConsentRequest> {
  const userId = await getAuthenticatedUserId()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consent_requests')
    .update({
      status: response,
      response_note: note ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  return data as ConsentRequest
}
