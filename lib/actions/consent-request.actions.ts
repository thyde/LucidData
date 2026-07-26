'use server'

import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { enqueueEvent } from '@/lib/services/webhook.service'
import type { ConsentRequest } from '@/types/database.types'

const consentAccessLevelSchema = z.enum(['read', 'export', 'verify'])

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

  if (response === 'approved') {
    consentAccessLevelSchema.parse(existing.access_level)
    const { data, error } = await supabase.rpc('approve_consent_request_atomic', {
      request_id: requestId,
      response_note: note,
    })
    if (error) throw error
    const result = data as unknown as { request: ConsentRequest; consent_id: string }
    await createAuditEntry({
      userId,
      eventType: 'consent_granted',
      action: `Approved ${existing.access_level} access request`,
      consentId: result.consent_id,
      metadata: {
        request_id: requestId,
        organization_id: existing.organization_id,
        data_category: existing.data_category,
      },
    })
    // LD-602: tell the organization instead of making it poll. Queued and
    // best-effort: a webhook problem must never fail the person's decision.
    await enqueueEvent(existing.organization_id, 'consent_request.approved', {
      type: 'consent_request',
      id: requestId,
    }).catch(() => undefined)
    return result.request
  }

  const { data, error } = await supabase
    .from('consent_requests')
    .update({
      status: 'denied',
      response_note: note ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  await enqueueEvent(existing.organization_id, 'consent_request.denied', {
    type: 'consent_request',
    id: requestId,
  }).catch(() => undefined)
  return data as ConsentRequest
}
