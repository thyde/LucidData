import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Organization, OrgMember } from '@/types/database.types'

export type OrgRole = OrgMember['role']

export interface OrgMembership {
  organization: Organization
  role: OrgRole
}

// The generated Database types carry no FK relationship metadata, so Supabase
// infers embedded joins as `never`. We cast the join rows to this shape.
type MemberJoinRow = { role: OrgRole; organization: Organization | null }

/**
 * Returns the authenticated user's id, or throws. Shared by org portal
 * server actions that operate on behalf of a logged-in org member.
 */
async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/**
 * All organizations the current user belongs to, with their role in each.
 */
export async function getMyOrganizations(): Promise<OrgMembership[]> {
  const userId = await requireUserId()
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_members')
    .select('role, organization:organizations(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as MemberJoinRow[]
  return rows
    .filter((row) => row.organization)
    .map((row) => ({
      organization: row.organization as Organization,
      role: row.role,
    }))
}

/**
 * Asserts the current user is a member of `organizationId` (optionally with one
 * of `allowedRoles`) and returns the org + role. Throws otherwise. Use at the
 * top of org-portal server actions before touching org-scoped data.
 */
export async function requireOrgMembership(
  organizationId: string,
  allowedRoles?: OrgRole[]
): Promise<OrgMembership> {
  const userId = await requireUserId()
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_members')
    .select('role, organization:organizations(*)')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  const row = data as unknown as MemberJoinRow | null
  if (!row || !row.organization) throw new Error('Forbidden: not a member of this organization')

  const role = row.role
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new Error('Forbidden: insufficient role')
  }

  return { organization: row.organization as Organization, role }
}

/**
 * Links a user to an organization with a role. Idempotent on (org, user).
 * Uses the service role so it can run during onboarding before any RLS context.
 */
export async function addOrgMember(
  organizationId: string,
  userId: string,
  role: OrgRole
): Promise<void> {
  const service = createServiceClient()
  const { error } = await service
    .from('org_members')
    .upsert(
      { organization_id: organizationId, user_id: userId, role },
      { onConflict: 'organization_id,user_id' }
    )
  if (error) throw error
}
