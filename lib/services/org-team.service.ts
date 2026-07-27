import { randomBytes, createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { UserFacingError } from '@/lib/actions/action-result'
import { createNotification } from '@/lib/services/notification.service'
import type { OrgRole } from '@/lib/middleware/withOrgMember'

/**
 * LD-603 organization team management.
 *
 * Invitations are single use, expire, and are bound to the invited address, so a
 * leaked link cannot be redeemed by someone else. Every membership change is
 * audited against the acting member.
 *
 * All reads and writes here use the service role, because org membership rows
 * belong to other people. Every caller must pass an owner check first.
 */

const INVITE_TTL_DAYS = 14

export interface OrgMemberSummary {
  userId: string
  email: string
  role: OrgRole
  joinedAt: string
}

export interface OrgInvitationSummary {
  id: string
  email: string
  role: OrgRole
  status: string
  expiresAt: string
  createdAt: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Members of an organization with their sign-in address and role. */
export async function listOrgMembers(organizationId: string): Promise<OrgMemberSummary[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_members')
    .select('user_id, role, created_at, user:users(email)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as {
    user_id: string
    role: OrgRole
    created_at: string
    user: { email: string } | null
  }[]

  return rows.map((row) => ({
    userId: row.user_id,
    email: row.user?.email ?? 'Unknown',
    role: row.role,
    joinedAt: row.created_at,
  }))
}

export async function listOrgInvitations(
  organizationId: string
): Promise<OrgInvitationSummary[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_invitations')
    .select('id, email, role, status, expires_at, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as OrgRole,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }))
}

async function countOwners(organizationId: string): Promise<number> {
  const service = createServiceClient()
  const { count, error } = await service
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
  if (error) throw error
  return count ?? 0
}

export interface CreatedInvitation {
  id: string
  /** Absolute link the invited person opens. Shown once, never stored raw. */
  inviteUrl: string
}

/**
 * Invite someone to an organization. Any existing pending invitation for the
 * same address is revoked first, so exactly one token is live at a time.
 */
export async function inviteOrgMember(
  organizationId: string,
  actingUserId: string,
  organizationName: string,
  email: string,
  role: OrgRole,
  appUrl: string
): Promise<CreatedInvitation> {
  const service = createServiceClient()
  const address = normalizeEmail(email)

  // Already a member: nothing to invite.
  const members = await listOrgMembers(organizationId)
  if (members.some((member) => normalizeEmail(member.email) === address)) {
    throw new UserFacingError('That person is already a member of this organization')
  }

  await service
    .from('org_invitations')
    .update({ status: 'revoked' })
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .ilike('email', address)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data, error } = await service
    .from('org_invitations')
    .insert({
      organization_id: organizationId,
      email: address,
      role,
      token_hash: hashToken(token),
      invited_by: actingUserId,
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (error) throw error

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'org_member_invited',
    action: `Invited ${address} to ${organizationName} as ${role}`,
    metadata: { organization_id: organizationId, invitation_id: data.id, role },
  })

  // Tell the invitee in-app if they already have an account. Email delivery is
  // handled by the notification layer when a transport is configured.
  const { data: existing } = await service
    .from('users')
    .select('id, email')
    .ilike('email', address)
    .maybeSingle()
  if (existing) {
    await createNotification({
      userId: existing.id,
      type: 'org_invitation',
      title: `${organizationName} invited you to join`,
      message: `You were invited to join ${organizationName} as ${role}. Open the invitation to accept.`,
      relatedEntityId: data.id,
      relatedEntityType: 'org_invitation',
      email: existing.email,
    }).catch(() => undefined)
  }

  return { id: data.id, inviteUrl: `${appUrl}/org/invite/${token}` }
}

export interface InvitationPreview {
  organizationId: string
  organizationName: string
  role: OrgRole
  email: string
}
/**
 * Resolve an invitation token for display. Returns null for anything that is not
 * a live, unexpired, pending invitation.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_invitations')
    .select('id, organization_id, email, role, status, expires_at, organization:organizations(name)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error) throw error
  if (!data || data.status !== 'pending') return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null

  const org = (data as unknown as { organization: { name: string } | null }).organization
  return {
    organizationId: data.organization_id,
    organizationName: org?.name ?? 'this organization',
    role: data.role as OrgRole,
    email: data.email,
  }
}

/**
 * Accept an invitation. The token must be live and the accepting account's email
 * must match the invited address, so a forwarded link cannot be redeemed by
 * someone else.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
  userEmail: string
): Promise<{ organizationId: string; role: OrgRole }> {
  const service = createServiceClient()
  const tokenHash = hashToken(token)

  const { data: invitation, error } = await service
    .from('org_invitations')
    .select('id, organization_id, email, role, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!invitation) throw new UserFacingError('This invitation is not valid')
  if (invitation.status !== 'pending') throw new UserFacingError('This invitation has already been used')
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    await service.from('org_invitations').update({ status: 'expired' }).eq('id', invitation.id)
    throw new UserFacingError('This invitation has expired')
  }
  if (normalizeEmail(invitation.email) !== normalizeEmail(userEmail)) {
    throw new UserFacingError('This invitation was sent to a different email address')
  }

  // Single use: only the update that still sees 'pending' wins, so a double
  // submit cannot consume the token twice.
  const { data: claimed, error: claimError } = await service
    .from('org_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', invitation.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) throw new UserFacingError('This invitation has already been used')

  const { error: memberError } = await service.from('org_members').upsert(
    {
      organization_id: invitation.organization_id,
      user_id: userId,
      role: invitation.role,
    },
    { onConflict: 'organization_id,user_id' }
  )
  if (memberError) throw memberError

  await createAuditEntry({
    userId,
    eventType: 'org_member_joined',
    action: `Joined an organization as ${invitation.role}`,
    metadata: {
      organization_id: invitation.organization_id,
      invitation_id: invitation.id,
      role: invitation.role,
    },
  })

  return { organizationId: invitation.organization_id, role: invitation.role as OrgRole }
}

export async function revokeInvitation(
  organizationId: string,
  actingUserId: string,
  invitationId: string
): Promise<void> {
  const service = createServiceClient()
  const { error } = await service
    .from('org_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
  if (error) throw error

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'org_invitation_revoked',
    action: 'Revoked an organization invitation',
    metadata: { organization_id: organizationId, invitation_id: invitationId },
  })
}

/** Change a member's role. An organization must always keep at least one owner. */
export async function changeOrgMemberRole(
  organizationId: string,
  actingUserId: string,
  targetUserId: string,
  role: OrgRole
): Promise<void> {
  const service = createServiceClient()
  const { data: current, error: readError } = await service
    .from('org_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (readError) throw readError
  if (!current) throw new UserFacingError('That person is not a member of this organization')
  if (current.role === role) return

  if (current.role === 'owner' && (await countOwners(organizationId)) <= 1) {
    throw new UserFacingError('An organization must keep at least one owner')
  }

  const { error } = await service
    .from('org_members')
    .update({ role })
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
  if (error) throw error

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'org_member_role_changed',
    action: `Changed an organization member role from ${current.role} to ${role}`,
    metadata: {
      organization_id: organizationId,
      target_user_id: targetUserId,
      from_role: current.role,
      to_role: role,
    },
  })
}

/** Remove a member. Access ends immediately, including for any live session. */
export async function removeOrgMember(
  organizationId: string,
  actingUserId: string,
  targetUserId: string
): Promise<void> {
  const service = createServiceClient()
  const { data: current, error: readError } = await service
    .from('org_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (readError) throw readError
  if (!current) return

  if (current.role === 'owner' && (await countOwners(organizationId)) <= 1) {
    throw new UserFacingError('An organization must keep at least one owner')
  }

  const { error } = await service
    .from('org_members')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
  if (error) throw error

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'org_member_removed',
    action: `Removed an organization member (${current.role})`,
    metadata: {
      organization_id: organizationId,
      target_user_id: targetUserId,
      removed_role: current.role,
    },
  })
}

/**
 * Hand ownership to another member. The new owner is promoted before the old one
 * is demoted, so the organization is never without an owner.
 */
export async function transferOrgOwnership(
  organizationId: string,
  actingUserId: string,
  targetUserId: string
): Promise<void> {
  if (actingUserId === targetUserId) return
  const service = createServiceClient()

  const { data: target, error: readError } = await service
    .from('org_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (readError) throw readError
  if (!target) throw new UserFacingError('That person is not a member of this organization')

  const { error: promoteError } = await service
    .from('org_members')
    .update({ role: 'owner' })
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
  if (promoteError) throw promoteError

  const { error: demoteError } = await service
    .from('org_members')
    .update({ role: 'issuer_admin' })
    .eq('organization_id', organizationId)
    .eq('user_id', actingUserId)
  if (demoteError) throw demoteError

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'org_ownership_transferred',
    action: 'Transferred organization ownership',
    metadata: { organization_id: organizationId, new_owner_user_id: targetUserId },
  })
}
