import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { enqueueEvent } from '@/lib/services/webhook.service'
import { UserFacingError } from '@/lib/actions/action-result'
import type { ConsentRequest } from '@/types/database.types'

const consentAccessLevelSchema = z.enum(['read', 'export', 'verify'])

export type ConsentRequestWithOrg = ConsentRequest & {
  organization: { name: string; email: string } | null
}

/**
 * The person's consent requests, newest first.
 *
 * The requests are read under the person's own session, so row level security
 * decides what comes back. A person cannot read an organization's row, so the
 * names of the organizations that asked are looked up with the service role,
 * for exactly those organizations and nothing else.
 */
export async function listConsentRequestsForUser(userId: string): Promise<ConsentRequestWithOrg[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consent_requests')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
  if (error) throw error
  const requests = (data ?? []) as ConsentRequest[]
  if (requests.length === 0) return []

  const service = createServiceClient()
  const organizationIds = [...new Set(requests.map((request) => request.organization_id))]
  const { data: organizations, error: organizationError } = await service
    .from('organizations')
    .select('id, name, email')
    .in('id', organizationIds)
  if (organizationError) throw organizationError
  const byId = new Map(
    (organizations ?? []).map((organization) => [
      organization.id,
      { name: organization.name, email: organization.email },
    ])
  )
  return requests.map((request) => ({
    ...request,
    organization: byId.get(request.organization_id) ?? null,
  }))
}

/** Approve or deny one pending request. Approving creates the consent in the same transaction. */
export async function respondToConsentRequest(
  userId: string,
  requestId: string,
  response: 'approved' | 'denied',
  note?: string
): Promise<ConsentRequest> {
  const supabase = await createClient()

  // Load the request first (RLS guarantees ownership) so we can guard against
  // double-answering and read the org details needed to mint a consent.
  const { data: existingRow, error: loadError } = await supabase
    .from('consent_requests')
    .select('*')
    .eq('id', requestId)
    .eq('user_id', userId)
    .maybeSingle()
  if (loadError) throw loadError
  if (!existingRow) throw new UserFacingError('Consent request not found', 'not_found')
  const existing = existingRow as ConsentRequest
  if (existing.status !== 'pending') {
    throw new UserFacingError('This request has already been answered', 'conflict')
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
