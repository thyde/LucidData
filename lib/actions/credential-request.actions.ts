'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  createCredentialRequest,
  getCredentialRequestsForUser,
  getCredentialRequestsForOrg,
  fulfillCredentialRequest,
  denyCredentialRequest,
  getRequestFulfillment,
  type CredentialRequestWithOrg,
  type FulfilledCredentialView,
  type FulfillSelection,
} from '@/lib/services/credential-request.service'
import {
  createCredentialRequestSchema,
  fulfillCredentialRequestSchema,
} from '@/lib/validations/credential-request'
import type { CredentialRequest } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

// --- Subject (individual user) side ---

export async function getCredentialRequestsAction(): Promise<CredentialRequestWithOrg[]> {
  const userId = await getAuthenticatedUserId()
  return getCredentialRequestsForUser(userId)
}

export async function fulfillCredentialRequestAction(
  requestId: string,
  selections: FulfillSelection[]
): Promise<{ fulfilled: number }> {
  const userId = await getAuthenticatedUserId()
  const parsed = fulfillCredentialRequestSchema.parse({ selections })
  return fulfillCredentialRequest(userId, requestId, parsed.selections)
}

export async function denyCredentialRequestAction(
  requestId: string,
  note?: string
): Promise<void> {
  const userId = await getAuthenticatedUserId()
  await denyCredentialRequest(userId, requestId, note)
}

// --- Organization (verifier) side ---

export async function createCredentialRequestAction(
  organizationId: string,
  input: unknown
): Promise<{ created: boolean }> {
  await requireOrgMembership(organizationId, ['owner', 'verifier'])
  const data = createCredentialRequestSchema.parse(input)
  const request = await createCredentialRequest(organizationId, {
    subjectEmail: data.subjectEmail,
    purpose: data.purpose,
    requestedSchemaTypes: data.requestedSchemaTypes,
    message: data.message ?? null,
    expiresInDays: data.expiresInDays,
  })
  // Neutral result: never reveal whether the email maps to a Lucid account.
  return { created: request !== null }
}

export async function listOrgCredentialRequestsAction(
  organizationId: string
): Promise<CredentialRequest[]> {
  await requireOrgMembership(organizationId, ['owner', 'verifier'])
  return getCredentialRequestsForOrg(organizationId)
}

export async function getRequestFulfillmentAction(
  organizationId: string,
  requestId: string
): Promise<FulfilledCredentialView[]> {
  await requireOrgMembership(organizationId, ['owner', 'verifier'])
  return getRequestFulfillment(organizationId, requestId)
}
