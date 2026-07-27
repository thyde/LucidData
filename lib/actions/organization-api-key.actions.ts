'use server'

import { guarded, UserFacingError, type ActionFailure } from '@/lib/actions/action-result'
import { z } from 'zod'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  getOrganizationApiKeys,
  revokeOrganizationApiKey,
  rotateOrganizationApiKey,
  type RotatedOrganizationApiKey,
} from '@/lib/services/organization-api-key.service'
import type { OrganizationApiKeyMetadata } from '@/lib/repositories/organization-api-key.repository'

const keyNameSchema = z.string().trim().min(1).max(80)
const keyIdSchema = z.string().uuid()

export async function getOrganizationApiKeysAction(
  organizationId: string
): Promise<OrganizationApiKeyMetadata[] | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(organizationId, ['owner'])
    return getOrganizationApiKeys(organizationId)  })
}

export async function rotateOrganizationApiKeyAction(
  organizationId: string,
  name: string
): Promise<RotatedOrganizationApiKey | ActionFailure> {
  return guarded(async () => {
    const { organization } = await requireOrgMembership(organizationId, ['owner'])
    // LD-109: no usable key exists until the organization proves it controls its
    // domain, so a stranger cannot mint credentials under someone else's name.
    if (!organization.verified_at) {
      throw new UserFacingError('Verify your domain before creating an API key')
    }
    return rotateOrganizationApiKey(organizationId, keyNameSchema.parse(name))  })
}

export async function revokeOrganizationApiKeyAction(
  organizationId: string,
  keyId: string
): Promise<OrganizationApiKeyMetadata | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(organizationId, ['owner'])
    return revokeOrganizationApiKey(keyIdSchema.parse(keyId))  })
}