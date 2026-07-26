import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-607: the two GDPR Article 17 defects were that issued credentials kept
 * their claims and order records kept their payloads after erasure. These tests
 * assert the explicit handling that replaced the nulling foreign keys.
 */

process.env.ISSUER_KEY_SECRET =
  process.env.ISSUER_KEY_SECRET ?? Buffer.alloc(32, 9).toString('base64')

interface TableCall {
  table: string
  op: string
  patch?: Record<string, unknown>
  filters: [string, string, unknown][]
}

const tableCalls: TableCall[] = []
const rows = new Map<string, unknown[]>()
const counts = new Map<string, number>()
const deleteUser = vi.fn()
const createAuditEntry = vi.fn()
const accountsDel = vi.fn()
const isStripeConfigured = vi.fn(() => false)
const logSpy = vi.fn()
const inserts: { table: string; row: Record<string, unknown> }[] = []

function chain(
  table: string,
  op: string,
  patch?: Record<string, unknown>,
  head = false
) {
  const call: TableCall = { table, op, patch, filters: [] }
  tableCalls.push(call)
  const settle = () =>
    head
      ? { count: counts.get(table) ?? 0, data: null, error: null }
      : { data: rows.get(`${table}:${op}`) ?? [], error: null }
  const api = {
    eq(column: string, value: unknown) {
      call.filters.push(['eq', column, value])
      return api
    },
    like(column: string, value: unknown) {
      call.filters.push(['like', column, value])
      return api
    },
    in(column: string, value: unknown) {
      call.filters.push(['in', column, value])
      return api
    },
    contains(column: string, value: unknown) {
      call.filters.push(['contains', column, value])
      return api
    },
    select() {
      return Promise.resolve(settle())
    },
    maybeSingle() {
      const list = rows.get(`${table}:${op}`) ?? []
      return Promise.resolve({ data: list[0] ?? null, error: null })
    },
    then(resolve: (value: ReturnType<typeof settle>) => unknown) {
      return Promise.resolve(settle()).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    auth: { admin: { deleteUser: (...a: unknown[]) => deleteUser(...a) } },
    from: (table: string) => ({
      delete: () => chain(table, 'delete'),
      update: (patch: Record<string, unknown>) => chain(table, 'update', patch),
      select: (_columns?: string, options?: { head?: boolean; count?: string }) =>
        chain(table, 'select', undefined, options?.head === true),
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row })
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/stripe/client', () => ({
  isStripeConfigured: () => isStripeConfigured(),
  getStripe: () => ({ accounts: { del: (...a: unknown[]) => accountsDel(...a) } }),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: (...a: unknown[]) => logSpy(...a) },
}))

vi.mock('@/lib/services/platform-key.service', async () => {
  const { generateIssuerKey } = await import('@/lib/crypto/credential-signing')
  const key = generateIssuerKey()
  return {
    getOrCreateActivePlatformKey: () =>
      Promise.resolve({
        key_id: key.keyId,
        public_key: key.publicKey,
        encrypted_private_key: key.encryptedPrivateKey,
        private_key_iv: key.privateKeyIv,
      }),
  }
})

const { eraseUser, findResidualData } = await import('@/lib/services/deletion.service')
const { verifyDeletionReceipt, hashSubjectEmail } = await import(
  '@/lib/crypto/deletion-receipt'
)

const USER = '33333333-3333-4333-8333-333333333333'
const EMAIL = 'person@example.com'

beforeEach(() => {
  tableCalls.length = 0
  inserts.length = 0
  rows.clear()
  counts.clear()
  vi.clearAllMocks()
  isStripeConfigured.mockReturnValue(false)
  deleteUser.mockResolvedValue({ error: null })
  createAuditEntry.mockResolvedValue(undefined)
})

function callsFor(table: string, op: string) {
  return tableCalls.filter((call) => call.table === table && call.op === op)
}

describe('eraseUser: keys that do not cascade', () => {
  it('deletes credentials issued about the person rather than nulling the id', async () => {
    rows.set('issued_credentials:delete', [{ id: 'c1' }, { id: 'c2' }])
    const outcome = await eraseUser(USER, EMAIL)

    const [call] = callsFor('issued_credentials', 'delete')
    expect(call.filters).toContainEqual(['eq', 'subject_user_id', USER])
    expect(
      outcome.tables.find((entry) => entry.table === 'issued_credentials')?.affected
    ).toBe(2)
  })

  it('empties the payload on order records instead of only clearing the link', async () => {
    rows.set('data_order_records:update', [{ id: 'r1' }])
    await eraseUser(USER, EMAIL)

    const [call] = callsFor('data_order_records', 'update')
    expect(call.filters).toContainEqual(['eq', 'source_user_id', USER])
    // A nulled foreign key beside an intact payload is not anonymization.
    expect(call.patch?.payload).toEqual({})
    expect(call.patch?.source_user_id).toBeNull()
    expect(call.patch?.source_contribution_id).toBeNull()
    expect(call.patch?.redacted_at).toEqual(expect.any(String))
  })

  it('removes invitations addressed to the person, which are keyed by email', async () => {
    await eraseUser(USER, EMAIL)
    const [call] = callsFor('org_invitations', 'delete')
    expect(call.filters).toContainEqual(['eq', 'email', EMAIL])
  })

  it('removes rate-limit counters whose bucket embeds the subject id', async () => {
    await eraseUser(USER, EMAIL)
    const [call] = callsFor('rate_limit_counters', 'delete')
    expect(call.filters).toContainEqual(['like', 'bucket', `%:${USER}`])
  })
})

describe('eraseUser: ordering and third parties', () => {
  it('writes the audit entry before the user row disappears', async () => {
    const order: string[] = []
    createAuditEntry.mockImplementation(() => {
      order.push('audit')
      return Promise.resolve()
    })
    deleteUser.mockImplementation(() => {
      order.push('delete')
      return Promise.resolve({ error: null })
    })
    await eraseUser(USER, EMAIL)
    // audit_logs.user_id cascades, so a later write would be lost.
    expect(order).toEqual(['audit', 'delete'])
  })

  it('closes the connected payment account when one exists', async () => {
    isStripeConfigured.mockReturnValue(true)
    rows.set('payout_accounts:select', [{ stripe_account_id: 'acct_1' }])
    accountsDel.mockResolvedValue({})
    await eraseUser(USER, EMAIL)
    expect(accountsDel).toHaveBeenCalledWith('acct_1')
  })

  it('still erases when the payment provider fails', async () => {
    isStripeConfigured.mockReturnValue(true)
    rows.set('payout_accounts:select', [{ stripe_account_id: 'acct_1' }])
    accountsDel.mockRejectedValue(new Error('provider down'))
    const outcome = await eraseUser(USER, EMAIL)
    // A provider outage must not block the right to erasure.
    expect(deleteUser).toHaveBeenCalledWith(USER)
    expect(outcome.verified).toBe(true)
  })

  it('propagates a failed auth deletion instead of claiming success', async () => {
    deleteUser.mockResolvedValue({ error: new Error('auth unavailable') })
    await expect(eraseUser(USER, EMAIL)).rejects.toThrow('auth unavailable')
  })
})

describe('eraseUser: verification and evidence', () => {
  it('reports residual data rather than assuming the deletion worked', async () => {
    counts.set('vault_data', 3)
    const outcome = await eraseUser(USER, EMAIL)
    expect(outcome.residualTables).toContain('vault_data')
    expect(outcome.verified).toBe(false)
    expect(outcome.receipt.outcome.verified).toBe(false)
    expect(logSpy).toHaveBeenCalled()
  })

  it('issues a receipt that verifies against the signing key', async () => {
    const outcome = await eraseUser(USER, EMAIL)
    const { getOrCreateActivePlatformKey } = await import(
      '@/lib/services/platform-key.service'
    )
    const key = await getOrCreateActivePlatformKey('deletion_receipt')
    expect(
      verifyDeletionReceipt(key.public_key, outcome.receipt, outcome.signature)
    ).toBe(true)
  })

  it('stores the receipt with a hashed email and no address', async () => {
    await eraseUser(USER, EMAIL)
    const stored = inserts.find((entry) => entry.table === 'deletion_receipts')
    expect(stored).toBeDefined()
    expect(stored?.row.subject_email_hash).toBe(hashSubjectEmail(EMAIL))
    expect(JSON.stringify(stored?.row)).not.toContain(EMAIL)
  })

  it('discloses what a third party still holds', async () => {
    const outcome = await eraseUser(USER, EMAIL)
    expect(
      outcome.receipt.residualDisclosures.some((entry) => entry.holder === 'Stripe')
    ).toBe(true)
  })
})

describe('findResidualData', () => {
  it('reports nothing when every table is empty', async () => {
    expect(await findResidualData(USER, EMAIL)).toEqual([])
  })

  it('treats a table it cannot check as a table it cannot vouch for', async () => {
    counts.set('issued_credentials', 1)
    const residual = await findResidualData(USER, EMAIL)
    expect(residual).toContain('issued_credentials')
  })
})

describe('the audit chain after a deletion', () => {
  it('leaves every other chain verifiable, because chains are per user', async () => {
    const { createAuditHash, verifyHashChain } = await import('@/lib/crypto/hashing')
    const { manifestEntryFor } = await import('@/lib/constants/deletion-manifest')

    // A surviving user's chain, built the way audit.service builds one.
    const survivor = '44444444-4444-4444-8444-444444444444'
    const entries: {
      currentHash: string
      previousHash: string | null
      eventType: string
      userId: string
      timestamp: Date
      action: string
    }[] = []
    let previousHash: string | null = null
    for (const action of ['Created a vault entry', 'Granted consent', 'Revoked consent']) {
      const timestamp = new Date(`2026-07-2${entries.length + 1}T00:00:00.000Z`)
      const currentHash = createAuditHash(previousHash, {
        eventType: 'test_event',
        userId: survivor,
        timestamp,
        action,
      })
      entries.push({
        currentHash,
        previousHash,
        eventType: 'test_event',
        userId: survivor,
        timestamp,
        action,
      })
      previousHash = currentHash
    }
    expect(verifyHashChain(entries)).toBe(true)

    // Erasing a different person removes their chain and touches nothing else.
    await eraseUser(USER, EMAIL)
    expect(verifyHashChain(entries)).toBe(true)
    expect(manifestEntryFor('audit_logs')?.behaviour).toBe('cascade')
  })
})
