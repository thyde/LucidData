import { beforeEach, describe, expect, it, vi } from 'vitest'

// An in-memory stand-in for the service client that applies the `eq` filters a
// query sets, so the test sees what the database would return for it.
const tables: Record<string, Record<string, unknown>[]> = {}

function query(table: string) {
  const filters: [string, unknown][] = []
  const rows = () =>
    (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value))
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return builder
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
      resolve({ data: rows(), error: null }),
  }
  return builder
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: (table: string) => query(table) }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/services/share.service', () => ({ createShare: vi.fn() }))
vi.mock('@/lib/services/credential.service', () => ({
  verifyIssuedCredential: vi.fn().mockResolvedValue({ valid: true, reasons: [], warnings: [] }),
}))
vi.mock('@/lib/services/audit.service', () => ({ createAuditEntry: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({ createNotification: vi.fn() }))
vi.mock('@/lib/middleware/requireVerifiedOrg', () => ({ pendingRequestCountReached: vi.fn() }))

import { getRequestFulfillment } from '@/lib/services/credential-request.service'

function credential(id: string, subject: string) {
  return {
    id,
    organization_id: 'issuer-1',
    subject_user_id: subject,
    label: `Diploma ${id}`,
    schema_type: 'education',
    claims: { degree: 'BSc' },
  }
}

function share(id: string, credentialId: string, owner: string) {
  return {
    id,
    credential_id: credentialId,
    user_id: owner,
    credential_request_id: 'request-1',
    disclosed_claims: ['degree'],
    revoked: false,
    created_at: '2026-10-08T00:00:00Z',
  }
}

describe('getRequestFulfillment', () => {
  beforeEach(() => {
    tables.credential_requests = [
      { id: 'request-1', organization_id: 'org-1', user_id: 'recipient' },
    ]
    tables.issued_credentials = [
      credential('cred-recipient', 'recipient'),
      credential('cred-stranger', 'stranger'),
    ]
    tables.organizations = [{ id: 'issuer-1', name: 'Synthetic University', verified_at: null }]
  })

  it('shows what the person the request was sent to shared', async () => {
    tables.credential_shares = [share('share-1', 'cred-recipient', 'recipient')]

    const views = await getRequestFulfillment('org-1', 'request-1')

    expect(views.map((view) => view.shareId)).toEqual(['share-1'])
    expect(views[0].disclosedClaims).toEqual({ degree: 'BSc' })
  })

  it("ignores another person's share linked to the request, even of their own credential", async () => {
    tables.credential_shares = [
      share('share-1', 'cred-recipient', 'recipient'),
      share('share-2', 'cred-stranger', 'stranger'),
    ]

    const views = await getRequestFulfillment('org-1', 'request-1')

    expect(views.map((view) => view.shareId)).toEqual(['share-1'])
  })

  it('ignores a share of a credential its owner is not the subject of', async () => {
    tables.credential_shares = [share('share-3', 'cred-stranger', 'recipient')]

    await expect(getRequestFulfillment('org-1', 'request-1')).resolves.toEqual([])
  })

  it("returns nothing for another organization's request", async () => {
    tables.credential_shares = [share('share-1', 'cred-recipient', 'recipient')]

    await expect(getRequestFulfillment('org-2', 'request-1')).resolves.toEqual([])
  })
})
