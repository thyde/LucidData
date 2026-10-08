import { z } from 'zod'

/** Roles an owner may assign. Matches the org_members role check constraint. */
export const orgRoleSchema = z.enum(['owner', 'issuer_admin', 'verifier', 'member'])

export const inviteOrgMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  role: orgRoleSchema,
})

export const changeOrgMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: orgRoleSchema,
})

export const orgMemberTargetSchema = z.object({
  userId: z.string().uuid(),
})

export type InviteOrgMemberInput = z.infer<typeof inviteOrgMemberSchema>
export type ChangeOrgMemberRoleInput = z.infer<typeof changeOrgMemberRoleSchema>

/** What each role may do, shown in the portal so the choice is not a guess. */
export const ORG_ROLE_DESCRIPTIONS: Record<z.infer<typeof orgRoleSchema>, string> = {
  owner: 'Full access, including billing, API keys, and team management',
  issuer_admin: 'Issue and revoke credentials',
  verifier: 'Request and verify credentials',
  member: 'Read-only access to the organization',
}
