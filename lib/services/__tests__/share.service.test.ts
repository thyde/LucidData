import { beforeEach, describe, expect, it, vi } from 'vitest'

// A minimal stand-in for the service client: each table answers with the row
// set for it, through the chain resolveShareToken uses.
const rows: Record<string, unknown> = {}
const updates: string[] = []

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: () => {
          updates.push(table)
          return builder
        },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/services/credential.service', () => ({
  verifyIssuedCredential: vi.fn().mockResolvedValue({ valid: true, reasons: [], warnings: [] }),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/services/billing.service', () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

import { createAuditEntry } from '@/lib/services/audit.service'
import { resolveShareToken } from '@/lib/services/share.service'

const subjectId = 'subject-1'

function seed(shareOwner: string) {
  rows.credential_shares = {
    id: 'share-1',
    credential_id: 'credential-1',
    user_id: shareOwner,
    disclosed_claims: ['degree', 'gpa'],
    revoked: false,
    expires_at: null,
    view_count: 0,
  }
  rows.issued_credentials = {
    id: 'credential-1',
    organization_id: 'org-1',
    subject_user_id: subjectId,
    label: 'Diploma',
    schema_type: 'education',
    claims: { degree: 'BSc', gpa: '3.9', honors: 'withheld' },
    issued_at: '2026-01-01T00:00:00Z',
    expires_at: null,
  }
  rows.organizations = { name: 'Synthetic University', verified_at: '2026-01-01T00:00:00Z' }
}

describe('resolveShareToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updates.length = 0
  })

  it('shows the claims the subject chose to disclose', async () => {
    seed(subjectId)

    const view = await resolveShareToken('token')

    expect(view?.disclosedClaims).toEqual({ degree: 'BSc', gpa: '3.9' })
    expect(createAuditEntry).toHaveBeenCalledWith(expect.objectContaining({ userId: subjectId }))
  })

  it('ignores a share made by anyone other than the credential subject', async () => {
    seed('someone-else')

    await expect(resolveShareToken('token')).resolves.toBeNull()
    expect(updates).toEqual([])
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})
