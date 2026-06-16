'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { assertIssuanceQuota } from '@/lib/services/billing.service'
import {
  issueCredential,
  listIssuedCredentials,
  revokeCredential,
  getCredentialsForUser,
  claimCredential,
  linkCredentialVaultEntry,
  verifyIssuedCredential,
  exportCredentialVc,
  type IssueCredentialInput,
  type CredentialVerification,
} from '@/lib/services/credential.service'
import type { IssuedCredential } from '@/types/database.types'

async function getAuthUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user?.email) throw new Error('Unauthorized')
  return { id: user.id, email: user.email }
}

/** Issue a signed credential from the org portal. Requires a verified issuer. */
export async function issueCredentialAction(
  organizationId: string,
  input: IssueCredentialInput
): Promise<IssuedCredential> {
  const { organization } = await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  if (organization.org_type !== 'issuer' && organization.org_type !== 'both') {
    throw new Error('This organization is not configured as an issuer')
  }
  if (!organization.verified_at) {
    throw new Error('Verify your domain before issuing credentials')
  }
  if (!input.subjectEmail?.trim() || !input.label?.trim() || !input.schemaType) {
    throw new Error('Subject email, credential type, and label are required')
  }
  await assertIssuanceQuota(organization.id)

  return issueCredential(
    { id: organization.id, name: organization.name, domain: organization.domain },
    input
  )
}

export async function listIssuedCredentialsAction(
  organizationId: string
): Promise<IssuedCredential[]> {
  await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  return listIssuedCredentials(organizationId)
}

export async function revokeCredentialAction(
  organizationId: string,
  credentialId: string,
  reason: string
): Promise<IssuedCredential> {
  await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  return revokeCredential(organizationId, credentialId, reason || 'Revoked by issuer')
}

export interface MyCredential {
  credential: IssuedCredential
  issuerName: string
  issuerVerified: boolean
  verification: CredentialVerification
}

/** The signed-in user's credentials (claimed + claimable), with verification. */
export async function getMyCredentialsAction(): Promise<MyCredential[]> {
  const user = await getAuthUser()
  const credentials = await getCredentialsForUser(user.id, user.email)
  if (credentials.length === 0) return []

  const service = createServiceClient()
  const orgIds = [...new Set(credentials.map((c) => c.organization_id))]
  const { data: orgs } = await service
    .from('organizations')
    .select('id, name, verified_at')
    .in('id', orgIds)
  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]))

  return Promise.all(
    credentials.map(async (credential) => ({
      credential,
      issuerName: orgMap.get(credential.organization_id)?.name ?? 'Unknown issuer',
      issuerVerified: Boolean(orgMap.get(credential.organization_id)?.verified_at),
      verification: await verifyIssuedCredential(credential),
    }))
  )
}

export async function claimCredentialAction(credentialId: string): Promise<IssuedCredential> {
  const user = await getAuthUser()
  const claimed = await claimCredential(credentialId, user.id, user.email)
  if (!claimed) throw new Error('Credential not found or already claimed')
  return claimed
}

export async function linkCredentialVaultEntryAction(
  credentialId: string,
  vaultDataId: string
): Promise<void> {
  const user = await getAuthUser()
  await linkCredentialVaultEntry(credentialId, user.id, vaultDataId)
}

/** Export an owned credential as a portable W3C Verifiable Credential document. */
export async function exportCredentialVcAction(
  credentialId: string
): Promise<Record<string, unknown>> {
  const user = await getAuthUser()
  return exportCredentialVc(user.id, credentialId)
}
