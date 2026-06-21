import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createShare } from '@/lib/services/share.service'
import { verifyIssuedCredential, type CredentialVerification } from '@/lib/services/credential.service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { createNotification } from '@/lib/services/notification.service'
import type { CredentialRequest, CredentialShare, IssuedCredential } from '@/types/database.types'

export interface CreateCredentialRequestParams {
  subjectEmail: string
  purpose: string
  requestedSchemaTypes: string[]
  message?: string | null
  expiresInDays: number
}

export type CredentialRequestWithOrg = CredentialRequest & {
  organization: { name: string; email: string } | null
}

export interface FulfillSelection {
  credentialId: string
  disclosedClaims: string[]
}

/**
 * An organization addresses a credential request to a user by email. If no user
 * with that email exists, returns null so the caller can respond neutrally and
 * avoid leaking account existence.
 */
export async function createCredentialRequest(
  organizationId: string,
  params: CreateCredentialRequestParams
): Promise<CredentialRequest | null> {
  const service = createServiceClient()
  const email = params.subjectEmail.trim().toLowerCase()

  const { data: user } = await service
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (!user) return null

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + params.expiresInDays)

  const { data, error } = await service
    .from('credential_requests')
    .insert({
      organization_id: organizationId,
      user_id: (user as { id: string }).id,
      subject_email: email,
      purpose: params.purpose,
      requested_schema_types: params.requestedSchemaTypes,
      message: params.message ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error

  const { data: org } = await service
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle()
  const orgName = (org as { name: string } | null)?.name ?? 'An organization'
  await createNotification({
    userId: (user as { id: string }).id,
    type: 'credential_request',
    title: 'New credential request',
    message: `${orgName} requested credentials: ${params.requestedSchemaTypes.join(', ')}.`,
    relatedEntityId: (data as CredentialRequest).id,
    relatedEntityType: 'credential_request',
    email,
  })

  return data as CredentialRequest
}

/** Incoming credential requests for a user, with the requesting org's identity. */
export async function getCredentialRequestsForUser(
  userId: string
): Promise<CredentialRequestWithOrg[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('credential_requests')
    .select('*, organization:organizations(name, email)')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CredentialRequestWithOrg[]
}

/** Requests an organization has sent, newest first. */
export async function getCredentialRequestsForOrg(
  organizationId: string
): Promise<CredentialRequest[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('credential_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('requested_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CredentialRequest[]
}

/**
 * Fulfill a pending request by creating a credential share for each chosen
 * credential, linked back to the request so the requesting org can view exactly
 * what was disclosed. The user must own each credential (enforced by createShare).
 */
export async function fulfillCredentialRequest(
  userId: string,
  requestId: string,
  selections: FulfillSelection[]
): Promise<{ fulfilled: number }> {
  const supabase = await createClient()
  // RLS guarantees the request belongs to this user.
  const { data: reqRow, error: loadErr } = await supabase
    .from('credential_requests')
    .select('*')
    .eq('id', requestId)
    .eq('user_id', userId)
    .single()
  if (loadErr) throw loadErr
  const request = reqRow as CredentialRequest
  if (request.status !== 'pending') {
    throw new Error('This request has already been answered')
  }

  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('email')
    .eq('id', request.organization_id)
    .maybeSingle()
  const verifierEmail = (org as { email: string } | null)?.email ?? null

  for (const selection of selections) {
    await createShare(userId, selection.credentialId, selection.disclosedClaims, {
      verifierEmail,
      credentialRequestId: requestId,
      expiresAt: request.expires_at,
    })
  }

  const { error: updateErr } = await supabase
    .from('credential_requests')
    .update({ status: 'fulfilled', responded_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('user_id', userId)
  if (updateErr) throw updateErr

  await createAuditEntry({
    userId,
    eventType: 'credential_request_fulfilled',
    action: `Shared ${selections.length} credential(s) in response to a request`,
    metadata: { requestId, count: selections.length },
  })

  return { fulfilled: selections.length }
}

/** Decline a pending credential request. */
export async function denyCredentialRequest(
  userId: string,
  requestId: string,
  note?: string
): Promise<void> {
  const supabase = await createClient()
  const { data: reqRow, error: loadErr } = await supabase
    .from('credential_requests')
    .select('status')
    .eq('id', requestId)
    .eq('user_id', userId)
    .single()
  if (loadErr) throw loadErr
  if ((reqRow as { status: string }).status !== 'pending') {
    throw new Error('This request has already been answered')
  }

  const { error } = await supabase
    .from('credential_requests')
    .update({
      status: 'denied',
      response_note: note ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('user_id', userId)
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'credential_request_denied',
    action: 'Denied a credential request',
    metadata: { requestId },
  })
}

/** What an organization sees for a fulfilled request: disclosed fields + verification. */
export interface FulfilledCredentialView {
  shareId: string
  label: string
  schemaType: string
  issuerName: string
  issuerVerified: boolean
  disclosedClaims: Record<string, unknown>
  verification: CredentialVerification
  revoked: boolean
  sharedAt: string
}

/**
 * For the requesting organization: resolve every share created to fulfill a
 * request, verifying each issuer signature and projecting only the disclosed
 * claims. Scoped to the org that owns the request.
 */
export async function getRequestFulfillment(
  organizationId: string,
  requestId: string
): Promise<FulfilledCredentialView[]> {
  const service = createServiceClient()

  const { data: reqRow } = await service
    .from('credential_requests')
    .select('id')
    .eq('id', requestId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!reqRow) return []

  const { data: shares } = await service
    .from('credential_shares')
    .select('*')
    .eq('credential_request_id', requestId)
    .order('created_at', { ascending: false })

  const result: FulfilledCredentialView[] = []
  for (const share of (shares ?? []) as CredentialShare[]) {
    const { data: credRow } = await service
      .from('issued_credentials')
      .select('*')
      .eq('id', share.credential_id)
      .maybeSingle()
    if (!credRow) continue
    const credential = credRow as IssuedCredential

    const verification = await verifyIssuedCredential(credential)
    const { data: issuer } = await service
      .from('organizations')
      .select('name, verified_at')
      .eq('id', credential.organization_id)
      .maybeSingle()

    const allClaims = (credential.claims ?? {}) as Record<string, unknown>
    const disclosed: Record<string, unknown> = {}
    for (const key of share.disclosed_claims) {
      if (key in allClaims) disclosed[key] = allClaims[key]
    }

    const reasons = [...verification.reasons]
    if (share.revoked) reasons.push('Share was revoked by the holder')

    result.push({
      shareId: share.id,
      label: credential.label,
      schemaType: credential.schema_type,
      issuerName: (issuer as { name: string } | null)?.name ?? 'Unknown issuer',
      issuerVerified: Boolean((issuer as { verified_at: string | null } | null)?.verified_at),
      disclosedClaims: disclosed,
      verification: { valid: verification.valid && !share.revoked, reasons },
      revoked: share.revoked,
      sharedAt: share.created_at,
    })
  }
  return result
}
