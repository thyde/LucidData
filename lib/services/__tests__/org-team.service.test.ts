import { describe, it, expect, beforeEach, vi } from 'vitest'

const createAuditEntry = vi.fn()
const createNotification = vi.fn()

/**
 * Minimal Supabase query-builder stub. Each `from(table)` returns a chainable
 * object whose terminal calls resolve from a per-table script the test sets.
 */
type TableScript = {
  select?: unknown
  update?: unknown
  insert?: unknown
  delete?: unknown
  count?: number
}

const scripts = new Map<string, TableScript>()
const calls: { table: string; op: string; payload?: unknown }[] = []

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/services/notification.service', () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const script = scripts.get(table) ?? {}
      let op = 'select'
      let counting = false
      const chain = {
        select: (_cols?: string, options?: { count?: string; head?: boolean }) => {
          if (options?.head) counting = true
          return chain
        },
        insert: (payload: unknown) => {
          op = 'insert'
          calls.push({ table, op, payload })
          return chain
        },
        upsert: (payload: unknown) => {
          op = 'upsert'
          calls.push({ table, op, payload })
          return chain
        },
        update: (payload: unknown) => {
          op = 'update'
          calls.push({ table, op, payload })
          return chain
        },
        delete: () => {
          op = 'delete'
          calls.push({ table, op })
          return chain
        },
        eq: () => chain,
        ilike: () => chain,
        order: () => Promise.resolve(script.select ?? { data: [], error: null }),
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve(
            (op === 'update' ? script.update : script.select) ?? { data: null, error: null }
          ),
        single: () =>
          Promise.resolve(
            (op === 'insert' ? script.insert : script.select) ?? { data: null, error: null }
          ),
        then: (resolve: (value: unknown) => unknown) =>
          resolve(counting ? { count: script.count ?? 0, error: null } : { error: null }),
      }
      return chain
    },
  }),
}))

const {
  inviteOrgMember,
  acceptInvitation,
  changeOrgMemberRole,
  removeOrgMember,
  transferOrgOwnership,
} = await import('@/lib/services/org-team.service')

function reset() {
  scripts.clear()
  calls.length = 0
  createAuditEntry.mockReset().mockResolvedValue(undefined)
  createNotification.mockReset().mockResolvedValue(undefined)
}

beforeEach(reset)

function memberList(rows: { user_id: string; role: string; email: string }[]) {
  return {
    data: rows.map((row) => ({
      user_id: row.user_id,
      role: row.role,
      created_at: '2026-07-25T00:00:00.000Z',
      user: { email: row.email },
    })),
    error: null,
  }
}

describe('inviteOrgMember', () => {
  it('issues a single-use link and audits the invitation', async () => {
    scripts.set('org_members', { select: memberList([]) })
    scripts.set('org_invitations', { insert: { data: { id: 'inv-1' }, error: null } })
    scripts.set('users', { select: { data: null, error: null } })

    const created = await inviteOrgMember(
      'org-1',
      'owner-1',
      'Acme',
      ' Colleague@Example.com ',
      'verifier',
      'https://app.example.com'
    )

    expect(created.inviteUrl).toMatch(/^https:\/\/app\.example\.com\/org\/invite\/.+/)

    const insert = calls.find((c) => c.table === 'org_invitations' && c.op === 'insert')
      ?.payload as Record<string, unknown>
    // The address is normalized, and only the hash is stored.
    expect(insert.email).toBe('colleague@example.com')
    expect(insert.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(insert)).not.toContain(created.inviteUrl.split('/').pop())
    expect(new Date(insert.expires_at as string).getTime()).toBeGreaterThan(Date.now())

    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'org_member_invited', userId: 'owner-1' })
    )
  })

  it('refuses to invite someone who is already a member', async () => {
    scripts.set('org_members', {
      select: memberList([{ user_id: 'u1', role: 'member', email: 'colleague@example.com' }]),
    })

    await expect(
      inviteOrgMember('org-1', 'owner-1', 'Acme', 'colleague@example.com', 'member', 'https://a')
    ).rejects.toThrow(/already a member/i)
  })
})

describe('acceptInvitation', () => {
  const live = {
    data: {
      id: 'inv-1',
      organization_id: 'org-1',
      email: 'colleague@example.com',
      role: 'verifier',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    error: null,
  }

  it('rejects a link redeemed by a different address', async () => {
    scripts.set('org_invitations', { select: live })

    await expect(
      acceptInvitation('token', 'user-2', 'someone.else@example.com')
    ).rejects.toThrow(/different email address/i)
    expect(calls.some((c) => c.table === 'org_members' && c.op === 'upsert')).toBe(false)
  })

  it('rejects an expired invitation', async () => {
    scripts.set('org_invitations', {
      select: {
        data: { ...live.data, expires_at: new Date(Date.now() - 60_000).toISOString() },
        error: null,
      },
    })

    await expect(
      acceptInvitation('token', 'user-2', 'colleague@example.com')
    ).rejects.toThrow(/expired/i)
  })

  it('rejects an invitation that was already used', async () => {
    scripts.set('org_invitations', {
      select: { data: { ...live.data, status: 'accepted' }, error: null },
    })

    await expect(
      acceptInvitation('token', 'user-2', 'colleague@example.com')
    ).rejects.toThrow(/already been used/i)
  })

  it('rejects a replayed token when the claiming update matches nothing', async () => {
    scripts.set('org_invitations', { select: live, update: { data: null, error: null } })

    await expect(
      acceptInvitation('token', 'user-2', 'colleague@example.com')
    ).rejects.toThrow(/already been used/i)
    expect(calls.some((c) => c.table === 'org_members' && c.op === 'upsert')).toBe(false)
  })

  it('adds the member with the invited role on success', async () => {
    scripts.set('org_invitations', { select: live, update: { data: { id: 'inv-1' }, error: null } })

    const result = await acceptInvitation('token', 'user-2', 'Colleague@Example.com')

    expect(result).toEqual({ organizationId: 'org-1', role: 'verifier' })
    const upsert = calls.find((c) => c.table === 'org_members' && c.op === 'upsert')
      ?.payload as Record<string, unknown>
    expect(upsert).toMatchObject({
      organization_id: 'org-1',
      user_id: 'user-2',
      role: 'verifier',
    })
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'org_member_joined' })
    )
  })
})

describe('last owner protection', () => {
  it('refuses to demote the only owner', async () => {
    scripts.set('org_members', { select: { data: { role: 'owner' }, error: null }, count: 1 })

    await expect(changeOrgMemberRole('org-1', 'owner-1', 'owner-1', 'member')).rejects.toThrow(
      /at least one owner/i
    )
    expect(calls.some((c) => c.table === 'org_members' && c.op === 'update')).toBe(false)
  })

  it('refuses to remove the only owner', async () => {
    scripts.set('org_members', { select: { data: { role: 'owner' }, error: null }, count: 1 })

    await expect(removeOrgMember('org-1', 'owner-1', 'owner-1')).rejects.toThrow(
      /at least one owner/i
    )
    expect(calls.some((c) => c.table === 'org_members' && c.op === 'delete')).toBe(false)
  })

  it('allows demoting an owner when another owner remains', async () => {
    scripts.set('org_members', { select: { data: { role: 'owner' }, error: null }, count: 2 })

    await expect(
      changeOrgMemberRole('org-1', 'owner-1', 'owner-2', 'member')
    ).resolves.toBeUndefined()
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'org_member_role_changed' })
    )
  })
})

describe('removeOrgMember', () => {
  it('deletes the membership and audits it', async () => {
    scripts.set('org_members', { select: { data: { role: 'verifier' }, error: null }, count: 1 })

    await removeOrgMember('org-1', 'owner-1', 'user-2')

    expect(calls.some((c) => c.table === 'org_members' && c.op === 'delete')).toBe(true)
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'org_member_removed', userId: 'owner-1' })
    )
  })
})

describe('transferOrgOwnership', () => {
  it('promotes the new owner before demoting the caller', async () => {
    scripts.set('org_members', { select: { data: { role: 'verifier' }, error: null }, count: 1 })

    await transferOrgOwnership('org-1', 'owner-1', 'user-2')

    const updates = calls
      .filter((c) => c.table === 'org_members' && c.op === 'update')
      .map((c) => c.payload)
    expect(updates[0]).toEqual({ role: 'owner' })
    expect(updates[1]).toEqual({ role: 'issuer_admin' })
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'org_ownership_transferred' })
    )
  })
})
