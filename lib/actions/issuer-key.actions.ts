'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  declareIssuerKeyCompromised,
  getIssuerPublicKeyHistory,
  getKeyLifecycleStatus,
  rotateIssuerKey,
  type KeyLifecycleStatus,
} from '@/lib/services/issuer-key.service'

/**
 * LD-406: issuer key rotation and compromise response.
 *
 * Only owners and issuer admins may touch signing keys, and no action here ever
 * returns private key material: rotation happens entirely server side.
 */

const rotateSchema = z.object({
  reason: z.string().trim().max(200).optional(),
})

const compromiseSchema = z.object({
  keyId: z.string().min(1),
  // When the key is believed to have leaked. Everything signed at or after this
  // moment fails verification.
  compromisedAt: z.string().datetime(),
})

async function requireActingUser(organizationId: string): Promise<string> {
  await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getKeyLifecycleStatusAction(
  organizationId: string
): Promise<KeyLifecycleStatus> {
  await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  return getKeyLifecycleStatus(organizationId)
}

export async function listIssuerPublicKeysAction(organizationId: string) {
  await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  return getIssuerPublicKeyHistory(organizationId)
}

export async function rotateIssuerKeyAction(
  organizationId: string,
  input: unknown
): Promise<{ keyId: string }> {
  const actingUserId = await requireActingUser(organizationId)
  const { reason } = rotateSchema.parse(input ?? {})
  const key = await rotateIssuerKey(organizationId, actingUserId, reason)
  // Only the identifier and public half ever leave the server.
  return { keyId: key.key_id }
}

export async function declareIssuerKeyCompromisedAction(
  organizationId: string,
  input: unknown
): Promise<{ affectedCredentials: number }> {
  const actingUserId = await requireActingUser(organizationId)
  const { keyId, compromisedAt } = compromiseSchema.parse(input)
  return declareIssuerKeyCompromised(organizationId, actingUserId, keyId, compromisedAt)
}
