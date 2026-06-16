'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createConsent } from '@/lib/services/consent.service'
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

  // Load the request first (RLS guarantees ownership) so we can guard against
  // double-answering and read the org details needed to mint a consent.
  const { data: existingRow, error: loadError } = await supabase
    .from('consent_requests')
    .select('*')
    .eq('id', requestId)
    .eq('user_id', userId)
    .single()
  if (loadError) throw loadError
  const existing = existingRow as ConsentRequest
  if (existing.status !== 'pending') {
    throw new Error('This request has already been answered')
  }

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
  const updated = data as ConsentRequest

  // Approving a request must actually grant access: create a consent record the
  // requesting organization can verify via GET /api/org/verify-consent.
  if (response === 'approved') {
    const service = createServiceClient()
    const { data: org } = await service
      .from('organizations')
      .select('name, email')
      .eq('id', updated.organization_id)
      .single()

    await createConsent(userId, {
      granted_to: updated.organization_id,
      granted_to_name: org?.name ?? undefined,
      granted_to_email: org?.email ?? undefined,
      access_level: updated.access_level,
      purpose: updated.purpose,
      end_date: updated.expires_at ?? undefined,
      consent_type: 'explicit',
    })
  }

  return updated
}
