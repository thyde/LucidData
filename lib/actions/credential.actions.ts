'use server'

import { guarded, UserFacingError, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { assertIssuanceQuota } from '@/lib/services/billing.service'
import {
  issueCredential,
  listIssuedCredentials,
  revokeCredential,
  listHeldCredentials,
  claimCredential,
  linkCredentialVaultEntry,
  exportCredentialVc,
  type IssueCredentialInput,
  type HeldCredential,
} from '@/lib/services/credential.service'
import {
  exportCredentialAs,
  type FormatExport,
} from '@/lib/services/credential-format.service'
import { describeFormats } from '@/lib/credentials/formats'
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
): Promise<IssuedCredential | ActionFailure> {
  return guarded(async () => {
    const { organization } = await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
    if (organization.org_type !== 'issuer' && organization.org_type !== 'both') {
      throw new UserFacingError('This organization is not configured as an issuer')
    }
    if (!organization.verified_at) {
      throw new UserFacingError('Verify your domain before issuing credentials')
    }
    if (!input.subjectEmail?.trim() || !input.label?.trim() || !input.schemaType) {
      throw new UserFacingError('Subject email, credential type, and label are required')
    }
    await assertIssuanceQuota(organization.id)

    return issueCredential(
      { id: organization.id, name: organization.name, domain: organization.domain },
      input
    )
  })
}

export async function listIssuedCredentialsAction(
  organizationId: string
): Promise<IssuedCredential[] | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
    return listIssuedCredentials(organizationId)
  })
}

export async function revokeCredentialAction(
  organizationId: string,
  credentialId: string,
  reason: string
): Promise<IssuedCredential | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
    return revokeCredential(organizationId, credentialId, reason || 'Revoked by issuer')
  })
}

export type MyCredential = HeldCredential

/** The signed-in user's credentials (claimed + claimable), with verification. */
export async function getMyCredentialsAction(): Promise<MyCredential[] | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthUser()
    return listHeldCredentials(user.id, user.email)
  })
}

export async function claimCredentialAction(credentialId: string): Promise<IssuedCredential | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthUser()
    const claimed = await claimCredential(credentialId, user.id, user.email)
    if (!claimed) throw new UserFacingError('Credential not found or already claimed')
    return claimed
  })
}

export async function linkCredentialVaultEntryAction(
  credentialId: string,
  vaultDataId: string
): Promise<void | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthUser()
    await linkCredentialVaultEntry(credentialId, user.id, vaultDataId)
  })
}

/** Export an owned credential as a portable W3C Verifiable Credential document. */
export async function exportCredentialVcAction(
  credentialId: string
): Promise<Record<string, unknown> | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthUser()
    return exportCredentialVc(user.id, credentialId)
  })
}

/**
 * LD-401: export an owned credential in a named standards format.
 *
 * The format is resolved before the credential is read, so an unsupported name
 * fails without revealing whether the credential exists.
 */
export async function exportCredentialAsAction(
  credentialId: string,
  format: string,
  version?: string
): Promise<FormatExport | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthUser()
    return exportCredentialAs(user.id, credentialId, format, version)
  })
}

/** The formats a holder can export into, for the export UI. */
export async function listCredentialFormatsAction(): Promise<
  { format: string; version: string; label: string; description: string }[]
 | ActionFailure> {
  return guarded(async () => {
    await getAuthUser()
    return describeFormats()
  })
}
