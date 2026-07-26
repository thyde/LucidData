import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-604: a bulk operation amplifies every mistake by the size of the upload.
 * These cover the four properties that make it safe to run one: idempotency on
 * retry, per-row failure isolation, cancellation between rows, and clearing an
 * uploaded row once its work is done.
 */

interface Row {
  id: string
  job_id: string
  row_index: number
  idempotency_key: string
  payload: Record<string, unknown>
  status: string
  result_id: string | null
  error: string | null
}

interface Job {
  id: string
  organization_id: string
  kind: string
  status: string
  total_rows: number
  processed_rows: number
  succeeded_rows: number
  failed_rows: number
  cancel_requested_at: string | null
  created_by: string | null
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

const jobs = new Map<string, Job>()
const rows: Row[] = []
const issueCredential = vi.fn()
const revokeCredential = vi.fn()
const createAuditEntry = vi.fn()
const enqueueEvent = vi.fn()
let nextId = 0

function id(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/services/webhook.service', () => ({
  enqueueEvent: (...a: unknown[]) => enqueueEvent(...a),
}))

vi.mock('@/lib/services/notification.service', () => ({
  createNotification: () => Promise.resolve(),
}))

vi.mock('@/lib/services/credential.service', () => ({
  issueCredential: (...a: unknown[]) => issueCredential(...a),
  revokeCredential: (...a: unknown[]) => revokeCredential(...a),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: vi.fn() },
}))

// `after()` needs a request scope. Record the callback instead of running it,
// so each test drives the sweep explicitly and one run cannot race another.
const scheduled: (() => Promise<void>)[] = []
vi.mock('next/server', () => ({
  after: (fn: () => Promise<void>) => {
    scheduled.push(fn)
  },
}))

function matches(record: any, filters: [string, string, unknown][]): boolean {
  return filters.every(([op, column, value]) => {
    if (op === 'eq') return record[column] === value
    if (op === 'in') return (value as unknown[]).includes(record[column])
    if (op === 'lt') {
      return record[column] !== null && String(record[column]) < String(value)
    }
    return true
  })
}

function tableFor(table: string): any[] {
  if (table === 'bulk_jobs') return [...jobs.values()]
  if (table === 'bulk_job_rows') return rows
  if (table === 'organizations') {
    return [{ id: 'org-1', name: 'Synthetic Issuer', domain: 'example.test' }]
  }
  if (table === 'users') return [{ id: 'user-target', email: 'person@example.com' }]
  return []
}

function builder(table: string, op: string, patch?: Record<string, unknown>) {
  const filters: [string, string, unknown][] = []
  let limit = Infinity
  let head = false

  const settle = () => {
    let hits = tableFor(table).filter((record) => matches(record, filters))
    hits = hits.slice(0, limit)

    if (op === 'update' && patch) {
      for (const hit of hits) Object.assign(hit, patch)
    }
    if (op === 'delete') {
      for (const hit of hits) {
        if (table === 'bulk_jobs') jobs.delete(hit.id)
        else {
          const index = rows.indexOf(hit)
          if (index >= 0) rows.splice(index, 1)
        }
      }
    }
    return hits
  }

  const resolve = () => {
    const data = settle()
    return head
      ? { count: data.length, data: null, error: null }
      : { data, error: null }
  }

  const api: any = {
    eq: (column: string, value: unknown) => {
      filters.push(['eq', column, value])
      return api
    },
    in: (column: string, value: unknown) => {
      filters.push(['in', column, value])
      return api
    },
    lt: (column: string, value: unknown) => {
      filters.push(['lt', column, value])
      return api
    },
    order: () => api,
    limit: (value: number) => {
      limit = value
      return api
    },
    select: (_columns?: string, options?: { head?: boolean; count?: string }) => {
      if (options?.head) head = true
      return api
    },
    single: () => Promise.resolve({ data: settle()[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: settle()[0] ?? null, error: null }),
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled),
  }
  return api
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: (columns?: string, options?: { head?: boolean; count?: string }) =>
        builder(table, 'select').select(columns, options),
      update: (patch: Record<string, unknown>) => builder(table, 'update', patch),
      delete: () => builder(table, 'delete'),
      insert: (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const list: Record<string, unknown>[] = Array.isArray(value) ? value : [value]
        const created = list.map((record) => {
          if (table === 'bulk_jobs') {
            const job: Job = {
              id: id('job'),
              organization_id: '',
              kind: '',
              status: 'pending',
              total_rows: 0,
              processed_rows: 0,
              succeeded_rows: 0,
              failed_rows: 0,
              cancel_requested_at: null,
              created_by: null,
              error: null,
              created_at: new Date().toISOString(),
              started_at: null,
              finished_at: null,
              ...(record as Partial<Job>),
            }
            jobs.set(job.id, job)
            return job
          }
          if (table === 'bulk_job_rows') {
            const row: Row = {
              id: id('row'),
              job_id: '',
              row_index: 0,
              idempotency_key: '',
              payload: {},
              status: 'pending',
              result_id: null,
              error: null,
              ...(record as Partial<Row>),
            }
            rows.push(row)
            return row
          }
          return { id: id('rec'), ...record }
        })
        return Object.assign(Promise.resolve({ data: created, error: null }), {
          select: () =>
            Object.assign(Promise.resolve({ data: created, error: null }), {
              single: () => Promise.resolve({ data: created[0], error: null }),
            }),
        })
      },
    }),
  }),
}))

const {
  createBulkJob,
  runBulkJobs,
  cancelBulkJob,
  retryFailedRows,
  listFailedRows,
  idempotencyKeyFor,
  purgeOldBulkJobs,
  DuplicateRowError,
} = await import('@/lib/services/bulk-job.service')

const ORG = 'org-1'
const ACTOR = 'user-1'

function issueRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    subject_email: `person${index}@example.com`,
    schema_type: 'education',
    label: `Degree ${index}`,
    claims: { degree: 'bachelor' },
  }))
}

beforeEach(() => {
  jobs.clear()
  rows.length = 0
  scheduled.length = 0
  nextId = 0
  vi.clearAllMocks()
  issueCredential.mockImplementation(() => Promise.resolve({ id: id('cred') }))
  revokeCredential.mockImplementation(() => Promise.resolve({ id: id('cred') }))
  createAuditEntry.mockResolvedValue(undefined)
  enqueueEvent.mockResolvedValue(0)
})

describe('starting promptly', () => {
  it('schedules the run for after the response, not for the daily sweep', async () => {
    // The Vercel plan permits a daily cron. An operator watching a progress bar
    // that does not move for a day would reasonably conclude this is broken.
    await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(1),
      confirmedCount: 1,
    })
    expect(scheduled).toHaveLength(1)
  })
})

describe('idempotency', () => {
  it('derives a stable key from the row content, whatever the key order', () => {
    const a = idempotencyKeyFor('credential_issue', { b: 2, a: 1 })
    const b = idempotencyKeyFor('credential_issue', { a: 1, b: 2 })
    expect(a).toBe(b)
  })

  it('separates rows that differ, and operations that differ', () => {
    expect(idempotencyKeyFor('credential_issue', { a: 1 })).not.toBe(
      idempotencyKeyFor('credential_issue', { a: 2 })
    )
    expect(idempotencyKeyFor('credential_issue', { a: 1 })).not.toBe(
      idempotencyKeyFor('credential_revoke', { a: 1 })
    )
  })

  it('refuses an upload that repeats a row', async () => {
    const duplicated = [...issueRows(1), ...issueRows(1)]
    await expect(
      createBulkJob(ORG, ACTOR, {
        kind: 'credential_issue',
        rows: duplicated,
        confirmedCount: 2,
      })
    ).rejects.toThrow(DuplicateRowError)
  })

  it('does not re-issue a row that already succeeded when the job runs again', async () => {
    await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(3),
      confirmedCount: 3,
    })
    await runBulkJobs()
    expect(issueCredential).toHaveBeenCalledTimes(3)

    // A second sweep finds nothing pending, so nothing is issued twice.
    await runBulkJobs()
    expect(issueCredential).toHaveBeenCalledTimes(3)
  })
})

describe('per-row failure isolation', () => {
  it('fails one row without failing the job', async () => {
    issueCredential.mockImplementation((_issuer: unknown, input: { subjectEmail: string }) => {
      if (input.subjectEmail === 'person1@example.com') {
        return Promise.reject(new Error('Plan quota exhausted'))
      }
      return Promise.resolve({ id: id('cred') })
    })

    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(3),
      confirmedCount: 3,
    })
    await runBulkJobs()

    const stored = jobs.get(job.id)!
    expect(stored.succeeded_rows).toBe(2)
    expect(stored.failed_rows).toBe(1)
    expect(stored.status).toBe('failed')
  })

  it('reports which row failed and why', async () => {
    issueCredential.mockRejectedValueOnce(new Error('Subject email is not deliverable'))
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(2),
      confirmedCount: 2,
    })
    await runBulkJobs()

    const failures = await listFailedRows(ORG, job.id)
    expect(failures).toHaveLength(1)
    expect(failures[0].rowIndex).toBe(0)
    expect(failures[0].error).toContain('not deliverable')
  })

  it('retries only the failed rows', async () => {
    issueCredential.mockRejectedValueOnce(new Error('Transient provider error'))
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(3),
      confirmedCount: 3,
    })
    await runBulkJobs()
    expect(issueCredential).toHaveBeenCalledTimes(3)

    await retryFailedRows(ORG, ACTOR, job.id)
    await runBulkJobs()

    // One more call, not four: the two that already succeeded are untouched.
    expect(issueCredential).toHaveBeenCalledTimes(4)
    expect(jobs.get(job.id)!.status).toBe('completed')
    expect(jobs.get(job.id)!.failed_rows).toBe(0)
  })

  it('refuses a retry when nothing failed', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(2),
      confirmedCount: 2,
    })
    await runBulkJobs()
    await expect(retryFailedRows(ORG, ACTOR, job.id)).rejects.toThrow('No failed rows')
  })
})

describe('cancellation', () => {
  it('stops before the remaining rows run', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(4),
      confirmedCount: 4,
    })
    // Cancel before the sweep starts, which is the case an operator hits when
    // they realise the upload was wrong.
    await cancelBulkJob(ORG, ACTOR, job.id)
    await runBulkJobs()

    expect(issueCredential).not.toHaveBeenCalled()
    expect(jobs.get(job.id)!.status).toBe('cancelled')
    expect(rows.every((row) => row.status === 'skipped')).toBe(true)
  })

  it('refuses to cancel a job that already finished', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(1),
      confirmedCount: 1,
    })
    await runBulkJobs()
    await expect(cancelBulkJob(ORG, ACTOR, job.id)).rejects.toThrow('already finished')
  })

  it('will not cancel another organization\u2019s job', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(1),
      confirmedCount: 1,
    })
    await expect(cancelBulkJob('other-org', ACTOR, job.id)).rejects.toThrow('Job not found')
  })
})

describe('uploaded rows do not linger', () => {
  it('clears the payload as soon as a row succeeds', async () => {
    await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(2),
      confirmedCount: 2,
    })
    expect(rows[0].payload).toHaveProperty('subject_email')

    await runBulkJobs()

    // The row held an email address for someone who may have no account here.
    for (const row of rows) {
      expect(row.status).toBe('succeeded')
      expect(row.payload).toEqual({})
    }
  })

  it('keeps a failed payload, because a retry needs it', async () => {
    issueCredential.mockRejectedValueOnce(new Error('Temporary failure'))
    await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(2),
      confirmedCount: 2,
    })
    await runBulkJobs()

    const failed = rows.find((row) => row.status === 'failed')!
    expect(failed.payload).toHaveProperty('subject_email')
  })

  it('purges jobs past the retention window', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(1),
      confirmedCount: 1,
    })
    await runBulkJobs()
    jobs.get(job.id)!.finished_at = new Date(Date.now() - 40 * 86_400_000).toISOString()

    expect(await purgeOldBulkJobs()).toBe(1)
    expect(jobs.has(job.id)).toBe(false)
  })
})

describe('completion signalling', () => {
  it('emits a completion webhook so the buyer does not poll', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(2),
      confirmedCount: 2,
    })
    await runBulkJobs()

    expect(enqueueEvent).toHaveBeenCalledWith(ORG, 'bulk_job.completed', {
      type: 'bulk_job',
      id: job.id,
    })
  })

  it('emits a failure webhook when any row failed', async () => {
    issueCredential.mockRejectedValueOnce(new Error('nope'))
    await createBulkJob(ORG, ACTOR, {
      kind: 'credential_issue',
      rows: issueRows(2),
      confirmedCount: 2,
    })
    await runBulkJobs()

    expect(enqueueEvent).toHaveBeenCalledWith(
      ORG,
      'bulk_job.failed',
      expect.objectContaining({ type: 'bulk_job' })
    )
  })

  it('audits the operation, not only its rows', async () => {
    await createBulkJob(ORG, ACTOR, {
      kind: 'credential_revoke',
      rows: [{ credential_id: 'c-1', reason: 'Issued in error' }],
      confirmedCount: 1,
    })
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'bulk_job_created', userId: ACTOR })
    )
  })
})

describe('consent requests in bulk', () => {
  it('records an unknown address as sent rather than reporting it back', async () => {
    const job = await createBulkJob(ORG, ACTOR, {
      kind: 'consent_request',
      rows: [
        {
          user_email: 'nobody@example.com',
          purpose: 'Verify enrolment for a student discount',
          access_level: 'verify',
          expires_in_days: 30,
        },
      ],
      confirmedCount: 1,
    })
    await runBulkJobs()

    // A bulk upload would otherwise be the fastest account-existence oracle in
    // the product, so a missing account succeeds silently.
    const stored = jobs.get(job.id)!
    expect(stored.succeeded_rows).toBe(1)
    expect(stored.failed_rows).toBe(0)
    expect(rows[0].result_id).toBeNull()
  })
})
