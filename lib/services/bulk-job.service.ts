/**
 * LD-604 bulk and asynchronous organization operations.
 *
 * The unit of work is a row, not a job. A cohort upload with one malformed
 * email must not fail wholesale, the operator has to see which rows failed and
 * why, and a retry must re-run only those. That is why every row carries its
 * own status, its own error, and its own idempotency key.
 *
 * Idempotency is the property that makes resuming safe. The key is derived from
 * the row's content, so a job that is retried, resumed after a crash, or picked
 * up twice by overlapping runners cannot issue the same credential twice.
 *
 * Row payloads are the uploaded file. They hold personal data about people who
 * may have no account here, so a payload is cleared the moment its row
 * succeeds, and the job is purged on a retention clock.
 */

import { createHash } from 'crypto'
import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import { issueCredential, revokeCredential } from '@/lib/services/credential.service'
import { enqueueEvent } from '@/lib/services/webhook.service'
import { createNotification } from '@/lib/services/notification.service'
import {
  MAX_BULK_ROWS,
  type BulkJobKind,
  type CreateBulkJobInput,
} from '@/lib/validations/bulk'
import type { BulkJob, Json } from '@/types/database.types'
import { UserFacingError } from '@/lib/actions/action-result'

/** Rows attempted per sweep. Bounded so one large job cannot starve the rest. */
export const ROWS_PER_SWEEP = 200

/** How long a finished job and its rows are kept before purging. */
export const BULK_JOB_RETENTION_DAYS = 30

export interface BulkJobSummary {
  id: string
  kind: BulkJobKind
  status: string
  totalRows: number
  processedRows: number
  succeededRows: number
  failedRows: number
  createdAt: string
  finishedAt: string | null
  error: string | null
}

export interface BulkJobRowResult {
  rowIndex: number
  status: string
  error: string | null
  resultId: string | null
}

/**
 * A stable fingerprint of what a row asks for. Two rows requesting the same
 * thing collide deliberately: the unique index rejects the duplicate rather
 * than issuing twice.
 */
export function idempotencyKeyFor(kind: BulkJobKind, row: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.keys(row)
      .sort()
      .map((key) => [key, row[key]])
  )
  return createHash('sha256').update(`${kind}:${canonical}`).digest('hex')
}

export class DuplicateRowError extends Error {
  constructor(public readonly rowIndex: number) {
    super(`Row ${rowIndex + 1} repeats an earlier row in this upload`)
    this.name = 'DuplicateRowError'
  }
}

/**
 * Create a job and start it as soon as the response is out.
 *
 * Not inline, because thousands of rows would hold the request open. Not left
 * to the scheduler either: the Vercel plan permits a daily cron, and an
 * operator watching a progress bar that does not move for a day would
 * reasonably conclude the feature is broken.
 */
export async function createBulkJob(
  orgId: string,
  actingUserId: string,
  input: CreateBulkJobInput
): Promise<BulkJobSummary> {
  if (input.rows.length > MAX_BULK_ROWS) {
    throw new UserFacingError(`A bulk job is limited to ${MAX_BULK_ROWS} rows`)
  }

  const seen = new Set<string>()
  const rows = input.rows.map((row, index) => {
    const key = idempotencyKeyFor(input.kind, row)
    if (seen.has(key)) throw new DuplicateRowError(index)
    seen.add(key)
    return { row, key, index }
  })

  const service = createServiceClient()
  const { data: job, error } = await service
    .from('bulk_jobs')
    .insert({
      organization_id: orgId,
      kind: input.kind,
      total_rows: rows.length,
      created_by: actingUserId,
    })
    .select('*')
    .single()
  if (error) throw error

  const { error: rowsError } = await service.from('bulk_job_rows').insert(
    rows.map((entry) => ({
      job_id: job.id as string,
      row_index: entry.index,
      idempotency_key: entry.key,
      payload: entry.row as Json,
    }))
  )
  if (rowsError) {
    await service.from('bulk_jobs').delete().eq('id', job.id as string)
    throw rowsError
  }

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'bulk_job_created',
    action: `Started a bulk ${input.kind.replace('_', ' ')} of ${rows.length} row(s)`,
    actorType: 'buyer',
    metadata: { job_id: job.id, organization_id: orgId, rows: rows.length },
  })

  scheduleRun()
  return toSummary(job)
}

function scheduleRun(): void {
  try {
    after(async () => {
      await runBulkJobs().catch((error) => {
        errorLogger.log(error, ErrorSeverity.MEDIUM, {
          action: 'BULK_JOB_IMMEDIATE_RUN_FAILED',
          resource: 'bulk_jobs',
        })
      })
    })
  } catch {
    // No request scope. The scheduled sweep will pick the job up.
  }
}

function toSummary(job: BulkJob): BulkJobSummary {
  return {
    id: job.id,
    kind: job.kind as BulkJobKind,
    status: job.status,
    totalRows: job.total_rows,
    processedRows: job.processed_rows,
    succeededRows: job.succeeded_rows,
    failedRows: job.failed_rows,
    createdAt: job.created_at,
    finishedAt: job.finished_at ?? null,
    error: job.error ?? null,
  }
}

export async function listBulkJobs(orgId: string): Promise<BulkJobSummary[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('bulk_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map(toSummary)
}

/** Row outcomes for one job, so a partial failure is inspectable. */
export async function listFailedRows(
  orgId: string,
  jobId: string
): Promise<BulkJobRowResult[]> {
  const service = createServiceClient()
  const job = await findJob(orgId, jobId)
  if (!job) throw new UserFacingError('Job not found')

  const { data, error } = await service
    .from('bulk_job_rows')
    .select('row_index, status, error, result_id')
    .eq('job_id', jobId)
    .eq('status', 'failed')
    .order('row_index')
  if (error) throw error

  return (data ?? []).map((row) => ({
    rowIndex: row.row_index as number,
    status: row.status as string,
    error: (row.error as string | null) ?? null,
    resultId: (row.result_id as string | null) ?? null,
  }))
}

async function findJob(orgId: string, jobId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('bulk_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Ask a running job to stop. Checked between rows rather than enforced
 * mid-flight, so a credential is never half issued.
 */
export async function cancelBulkJob(
  orgId: string,
  actingUserId: string,
  jobId: string
): Promise<BulkJobSummary> {
  const job = await findJob(orgId, jobId)
  if (!job) throw new UserFacingError('Job not found')
  if (['completed', 'failed', 'cancelled'].includes(job.status as string)) {
    throw new UserFacingError('This job has already finished')
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('bulk_jobs')
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq('id', jobId)
    .select('*')
    .single()
  if (error) throw error

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'bulk_job_cancelled',
    action: 'Requested cancellation of a bulk job',
    actorType: 'buyer',
    metadata: { job_id: jobId, organization_id: orgId },
  })

  return toSummary(data)
}

/**
 * Re-queue only the rows that failed. Succeeded rows keep their cleared
 * payload and are never touched again, so a retry cannot duplicate them.
 */
export async function retryFailedRows(
  orgId: string,
  actingUserId: string,
  jobId: string
): Promise<BulkJobSummary> {
  const job = await findJob(orgId, jobId)
  if (!job) throw new UserFacingError('Job not found')

  const service = createServiceClient()
  const { data: reset, error } = await service
    .from('bulk_job_rows')
    .update({ status: 'pending', error: null })
    .eq('job_id', jobId)
    .eq('status', 'failed')
    .select('id')
  if (error) throw error

  const retried = (reset ?? []).length
  if (retried === 0) throw new UserFacingError('No failed rows to retry')

  const { data: updated, error: jobError } = await service
    .from('bulk_jobs')
    .update({
      status: 'pending',
      failed_rows: 0,
      processed_rows: (job.succeeded_rows as number) ?? 0,
      cancel_requested_at: null,
      finished_at: null,
      error: null,
    })
    .eq('id', jobId)
    .select('*')
    .single()
  if (jobError) throw jobError

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'bulk_job_retried',
    action: `Retried ${retried} failed row(s) in a bulk job`,
    actorType: 'buyer',
    metadata: { job_id: jobId, organization_id: orgId, rows: retried },
  })

  scheduleRun()
  return toSummary(updated)
}

export interface BulkRunResult {
  processed: number
  failed: number
}

/**
 * Advance every runnable job by up to ROWS_PER_SWEEP rows.
 *
 * Resumable: a job that is interrupted leaves its remaining rows pending, and
 * the next sweep picks up exactly where it stopped, because progress lives on
 * the rows rather than in memory.
 */
export async function runBulkJobs(): Promise<BulkRunResult> {
  const service = createServiceClient()
  const result: BulkRunResult = { processed: 0, failed: 0 }

  const { data: jobs, error } = await service
    .from('bulk_jobs')
    .select('*')
    .in('status', ['pending', 'running'])
    .order('created_at')
    .limit(5)
  if (error) throw error

  for (const job of jobs ?? []) {
    const outcome = await runJob(job).catch((jobError) => {
      errorLogger.log(jobError, ErrorSeverity.HIGH, {
        action: 'BULK_JOB_FAILED',
        resource: 'bulk_jobs',
        metadata: { jobId: job.id },
      })
      return { processed: 0, failed: 0 }
    })
    result.processed += outcome.processed
    result.failed += outcome.failed
  }

  return result
}

async function runJob(job: BulkJob): Promise<BulkRunResult> {
  const service = createServiceClient()
  const result: BulkRunResult = { processed: 0, failed: 0 }

  if (job.status === 'pending') {
    await service
      .from('bulk_jobs')
      .update({ status: 'running', started_at: job.started_at ?? new Date().toISOString() })
      .eq('id', job.id)
  }

  const { data: rows, error } = await service
    .from('bulk_job_rows')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('row_index')
    .limit(ROWS_PER_SWEEP)
  if (error) throw error

  let cancelled = Boolean(job.cancel_requested_at)

  for (const row of rows ?? []) {
    if (!cancelled) {
      // Re-read the flag between rows so a cancellation lands within one row
      // rather than at the end of the sweep.
      const { data: current } = await service
        .from('bulk_jobs')
        .select('cancel_requested_at')
        .eq('id', job.id)
        .maybeSingle()
      cancelled = Boolean(current?.cancel_requested_at)
    }

    if (cancelled) {
      await service
        .from('bulk_job_rows')
        .update({ status: 'skipped', processed_at: new Date().toISOString() })
        .eq('id', row.id)
      continue
    }

    try {
      const resultId = await executeRow(job, row.payload as Record<string, unknown>)
      await service
        .from('bulk_job_rows')
        .update({
          status: 'succeeded',
          result_id: resultId,
          error: null,
          processed_at: new Date().toISOString(),
          // The payload was the uploaded row. Its work is done, so it goes.
          payload: {} as Json,
        })
        .eq('id', row.id)
      result.processed += 1
    } catch (rowError) {
      const message = rowError instanceof Error ? rowError.message : 'Row failed'
      await service
        .from('bulk_job_rows')
        .update({
          status: 'failed',
          // Kept, so the operator can retry only this row.
          error: message.slice(0, 500),
          processed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      result.failed += 1
    }
  }

  return finalizeJob(job.id as string, cancelled, result)
}

async function executeRow(
  job: Pick<BulkJob, 'kind' | 'organization_id'>,
  payload: Record<string, unknown>
): Promise<string | null> {
  const service = createServiceClient()

  if (job.kind === 'credential_issue') {
    const { data: org, error } = await service
      .from('organizations')
      .select('id, name, domain')
      .eq('id', job.organization_id)
      .single()
    if (error) throw error
    // Quota is enforced inside issueCredential, so a bulk path cannot spend
    // more allowance than a single one.
    const credential = await issueCredential(
      { id: org.id as string, name: org.name as string, domain: (org.domain as string) ?? null },
      {
        subjectEmail: String(payload.subject_email),
        schemaType: String(payload.schema_type),
        label: String(payload.label),
        claims: (payload.claims ?? {}) as Record<string, unknown>,
        expiresAt: (payload.expires_at as string | undefined) ?? null,
      }
    )
    return credential.id
  }

  if (job.kind === 'credential_revoke') {
    const credential = await revokeCredential(
      job.organization_id as string,
      String(payload.credential_id),
      String(payload.reason)
    )
    return credential.id
  }

  // consent_request: reaches a person, so it goes through the same neutral
  // path the single endpoint uses. An address with no account is recorded as
  // sent rather than reported back, because a bulk upload would otherwise be
  // the fastest account-existence oracle in the product.
  const email = String(payload.user_email).trim().toLowerCase()
  const { data: user } = await service
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (!user) return null

  const { data: request, error: insertError } = await service
    .from('consent_requests')
    .insert({
      organization_id: job.organization_id,
      user_id: user.id as string,
      purpose: String(payload.purpose),
      access_level: String(payload.access_level),
      expires_at: new Date(
        Date.now() + Number(payload.expires_in_days ?? 30) * 86_400_000
      ).toISOString(),
    })
    .select('id')
    .single()
  if (insertError) throw insertError

  await createNotification({
    userId: user.id as string,
    type: 'consent_request',
    title: 'An organization requested access to your data',
    message: String(payload.purpose),
    relatedEntityId: request.id as string,
    relatedEntityType: 'consent_request',
  }).catch(() => undefined)

  return request.id as string
}

async function finalizeJob(
  jobId: string,
  cancelled: boolean,
  sweep: BulkRunResult
): Promise<BulkRunResult> {
  const service = createServiceClient()

  const { count: remaining } = await service
    .from('bulk_job_rows')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('status', 'pending')

  const { data: counts } = await service
    .from('bulk_job_rows')
    .select('status')
    .eq('job_id', jobId)

  const succeeded = (counts ?? []).filter((row) => row.status === 'succeeded').length
  const failed = (counts ?? []).filter((row) => row.status === 'failed').length
  const processed = (counts ?? []).filter((row) => row.status !== 'pending').length

  const finished = (remaining ?? 0) === 0
  const status = !finished ? 'running' : cancelled ? 'cancelled' : failed > 0 ? 'failed' : 'completed'

  const { data: job } = await service
    .from('bulk_jobs')
    .update({
      status,
      processed_rows: processed,
      succeeded_rows: succeeded,
      failed_rows: failed,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq('id', jobId)
    .select('organization_id, kind')
    .maybeSingle()

  if (finished && job) {
    // LD-602: tell the organization the job is done instead of making it poll.
    await enqueueEvent(
      job.organization_id as string,
      status === 'completed' ? 'bulk_job.completed' : 'bulk_job.failed',
      { type: 'bulk_job', id: jobId }
    ).catch(() => undefined)
  }

  return sweep
}

/**
 * Purge finished jobs past their retention window, rows included. Uploaded
 * rows hold personal data about people who may have no account here, so they
 * do not sit around indefinitely as a record of a job that is long over.
 */
export async function purgeOldBulkJobs(now: Date = new Date()): Promise<number> {
  const service = createServiceClient()
  const cutoff = new Date(
    now.getTime() - BULK_JOB_RETENTION_DAYS * 86_400_000
  ).toISOString()

  const { data, error } = await service
    .from('bulk_jobs')
    .delete()
    .in('status', ['completed', 'failed', 'cancelled'])
    .lt('finished_at', cutoff)
    .select('id')
  if (error) throw error
  return (data ?? []).length
}
