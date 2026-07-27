'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  acceptInvitation,
  changeOrgMemberRole,
  inviteOrgMember,
  listOrgInvitations,
  listOrgMembers,
  previewInvitation,
  removeOrgMember,
  revokeInvitation,
  transferOrgOwnership,
  type CreatedInvitation,
  type InvitationPreview,
  type OrgInvitationSummary,
  type OrgMemberSummary,
} from '@/lib/services/org-team.service'
import {
  changeOrgMemberRoleSchema,
  inviteOrgMemberSchema,
  orgMemberTargetSchema,
} from '@/lib/validations/org-team'
import { assertRateLimit } from '@/lib/services/rate-limit.service'
import { guarded, type ActionFailure } from '@/lib/actions/action-result'

async function requireUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return { id: user.id, email: user.email ?? '' }
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export async function listOrgTeamAction(orgId: string): Promise<{
  members: OrgMemberSummary[]
  invitations: OrgInvitationSummary[]
} | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(orgId, ['owner'])
    const [members, invitations] = await Promise.all([
      listOrgMembers(orgId),
      listOrgInvitations(orgId),
    ])
    return { members, invitations }  })
}

export async function inviteOrgMemberAction(
  orgId: string,
  input: unknown
): Promise<CreatedInvitation | ActionFailure> {
  return guarded(async () => {
    const { organization } = await requireOrgMembership(orgId, ['owner'])
    const user = await requireUser()
    await assertRateLimit('orgInvitation', orgId)
    const { email, role } = inviteOrgMemberSchema.parse(input)
    return inviteOrgMember(orgId, user.id, organization.name, email, role, appUrl())
  })
}

export async function revokeOrgInvitationAction(
  orgId: string,
  invitationId: string
): Promise<void | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(orgId, ['owner'])
    const user = await requireUser()
    await revokeInvitation(orgId, user.id, invitationId)
  })
}

export async function changeOrgMemberRoleAction(
  orgId: string,
  input: unknown
): Promise<void | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(orgId, ['owner'])
    const user = await requireUser()
    const { userId, role } = changeOrgMemberRoleSchema.parse(input)
    await changeOrgMemberRole(orgId, user.id, userId, role)
  })
}

export async function removeOrgMemberAction(
  orgId: string,
  input: unknown
): Promise<void | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(orgId, ['owner'])
    const user = await requireUser()
    const { userId } = orgMemberTargetSchema.parse(input)
    await removeOrgMember(orgId, user.id, userId)
  })
}

export async function transferOrgOwnershipAction(
  orgId: string,
  input: unknown
): Promise<void | ActionFailure> {
  return guarded(async () => {
    await requireOrgMembership(orgId, ['owner'])
    const user = await requireUser()
    const { userId } = orgMemberTargetSchema.parse(input)
    await transferOrgOwnership(orgId, user.id, userId)
  })
}

/** Public-ish: any signed-in user may look at an invitation addressed to them. */
export async function previewInvitationAction(
  token: string
): Promise<InvitationPreview | null | ActionFailure> {
  return guarded(async () => {
    await requireUser()
    return previewInvitation(token)  })
}

export async function acceptInvitationAction(
  token: string
): Promise<{ organizationId: string } | ActionFailure> {
  return guarded(async () => {
    const user = await requireUser()
    const { organizationId } = await acceptInvitation(token, user.id, user.email)
    return { organizationId }
  })
}
