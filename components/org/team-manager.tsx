'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  changeOrgMemberRoleAction,
  inviteOrgMemberAction,
  listOrgTeamAction,
  removeOrgMemberAction,
  revokeOrgInvitationAction,
  transferOrgOwnershipAction,
} from '@/lib/actions/org-team.actions'
import { ORG_ROLE_DESCRIPTIONS } from '@/lib/validations/org-team'
import { unwrap } from '@/lib/actions/unwrap'
import { formatDate } from '@/lib/utils/date-formatter'
import type {
  OrgInvitationSummary,
  OrgMemberSummary,
} from '@/lib/services/org-team.service'

type Role = keyof typeof ORG_ROLE_DESCRIPTIONS
const ROLES = Object.keys(ORG_ROLE_DESCRIPTIONS) as Role[]

/**
 * LD-603: owners invite colleagues, assign roles, and remove access. Without
 * this an organization is one person and the whole role model is unreachable.
 */
export function TeamManager({
  orgId,
  currentUserId,
  initialMembers,
  initialInvitations,
}: {
  orgId: string
  currentUserId: string
  initialMembers: OrgMemberSummary[]
  initialInvitations: OrgInvitationSummary[]
}) {
  const [members, setMembers] = useState(initialMembers)
  const [invitations, setInvitations] = useState(initialInvitations)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ownerCount = members.filter((member) => member.role === 'owner').length

  async function refresh() {
    const team = await unwrap(listOrgTeamAction(orgId))
    setMembers(team.members)
    setInvitations(team.invitations)
  }

  // Each call unwraps its own action, so a user-facing failure arrives here as
  // an ordinary throw and the catch shows the message it carries.
  function run<T>(work: () => Promise<T>) {
    setError(null)
    startTransition(async () => {
      try {
        await work()
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That change could not be saved.')
      }
    })
  }

  function invite(event: React.FormEvent) {
    event.preventDefault()
    setInviteUrl(null)
    run(async () => {
      const created = await unwrap(inviteOrgMemberAction(orgId, { email, role }))
      setInviteUrl(created.inviteUrl)
      setEmail('')
    })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="rounded-lg border p-5 space-y-4">
        <div>
          <h3 className="font-medium">Invite a colleague</h3>
          <p className="text-sm text-muted-foreground mt-1">
            The invitation is single use, expires in 14 days, and only works for the address
            you enter.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            Send invitation
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">{ORG_ROLE_DESCRIPTIONS[role]}</p>

        {inviteUrl && (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">Invitation link</p>
            <p className="text-sm text-muted-foreground mt-1">
              Send this to your colleague. It is shown once.
            </p>
            <code className="mt-2 block break-all rounded bg-background p-2 text-xs">
              {inviteUrl}
            </code>
          </div>
        )}
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <h3 className="font-medium mb-3">Members</h3>
        <ul className="divide-y rounded-lg border">
          {members.map((member) => {
            const isLastOwner = member.role === 'owner' && ownerCount <= 1
            return (
              <li
                key={member.userId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {formatDate(member.joinedAt)}
                    {member.userId === currentUserId && ' · you'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    aria-label={`Role for ${member.email}`}
                    value={member.role}
                    disabled={pending || isLastOwner}
                    onChange={(e) =>
                      run(() =>
                        unwrap(changeOrgMemberRoleAction(orgId, {
                          userId: member.userId,
                          role: e.target.value,
                        }))
                      )
                    }
                  >
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  {member.userId !== currentUserId && member.role !== 'owner' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          unwrap(transferOrgOwnershipAction(orgId, { userId: member.userId }))
                        )
                      }
                    >
                      Make owner
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || isLastOwner}
                    onClick={() =>
                      run(() => unwrap(removeOrgMemberAction(orgId, { userId: member.userId })))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        {ownerCount <= 1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            An organization must keep at least one owner, so the last owner cannot be changed
            or removed.
          </p>
        )}
      </div>

      {invitations.length > 0 && (
        <div>
          <h3 className="font-medium mb-3">Invitations</h3>
          <ul className="divide-y rounded-lg border">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.role} · {invitation.status} · expires{' '}
                    {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                {invitation.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => unwrap(revokeOrgInvitationAction(orgId, invitation.id)))}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
