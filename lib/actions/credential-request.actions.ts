'use server'

import { guarded, UserFacingError, type ActionFailure } from '@/lib/actions/action-result'
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
import { assertRateLimit } from '@/lib/services/rate-limit.service'
import type { CredentialRequest } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

// --- Subject (individual user) side ---

export async function getCredentialRequestsAction(): Promise<CredentialRequestWithOrg[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return getCredentialRequestsForUser(userId)  })
}

export async function fulfillCredentialRequestAction(
  requestId: string,
  selections: FulfillSelection[]
): Promise<{ fulfilled: number } | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const parsed = fulfillCredentialRequestSchema.parse({ selections })
    return fulfillCredentialRequest(userId, requestId, parsed.selections)  })
}

export async function denyCredentialRequestAction(
  requestId: string,
  note?: string
): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await denyCredentialRequest(userId, requestId, note)  })
}

// --- Organization (verifier) side ---

export async function createCredentialRequestAction(
  organizationId: string,
  input: unknown
): Promise<{ created: boolean } | ActionFailure> {
  return guarded(async () => {
    const { organization } = await requireOrgMembership(organizationId, ['owner', 'verifier'])
    // LD-109: an unverified organization may not reach a person at all.
    if (!organization.verified_at) {
      throw new UserFacingError('Verify your domain before requesting credentials from people')
    }
    await assertRateLimit('credentialRequest', organizationId)

    const data = createCredentialRequestSchema.parse(input)
    const request = await createCredentialRequest(organizationId, {
      subjectEmail: data.subjectEmail,
      purpose: data.purpose,
      requestedSchemaTypes: data.requestedSchemaTypes,
      message: data.message ?? null,
      expiresInDays: data.expiresInDays,
    })
    // Neutral result: never reveal whether the email maps to a Lucid account.
    return { created: request !== null }  })
}

export async function listOrgCredentialRequestsAction(
  organizationId: string
): Promise<CredentialRequest[] | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(organizationId, ['owner', 'verifier'])
    return getCredentialRequestsForOrg(organizationId)  })
}

export async function getRequestFulfillmentAction(
  organizationId: string,
  requestId: string
): Promise<FulfilledCredentialView[] | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(organizationId, ['owner', 'verifier'])
    return getRequestFulfillment(organizationId, requestId)  })
}
