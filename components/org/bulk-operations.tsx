'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import {
  cancelBulkJobAction,
  createBulkJobAction,
  listFailedBulkRowsAction,
  retryBulkJobAction,
} from '@/lib/actions/bulk-job.actions'
import {
  BULK_JOB_KIND_LABELS,
  MAX_BULK_ROWS,
  type BulkJobKind,
} from '@/lib/validations/bulk'
import type { BulkJobRowResult, BulkJobSummary } from '@/lib/services/bulk-job.service'

/**
 * LD-604: run an operation across a cohort instead of one row at a time.
 *
 * The confirmation step is not decoration. A bulk revocation of the wrong
 * cohort cannot be undone, so the operator types the row count back before
 * anything runs.
 */
const PLACEHOLDERS: Record<BulkJobKind, string> = {
  credential_issue: `[
  {
    "subject_email": "person@example.com",
    "schema_type": "education",
    "label": "BSc Civil Engineering",
    "claims": { "degree": "bachelor", "graduation_year": 2026 }
  }
]`,
  credential_revoke: `[
  { "credential_id": "00000000-0000-0000-0000-000000000000", "reason": "Issued in error" }
]`,
  consent_request: `[
  {
    "user_email": "person@example.com",
    "purpose": "Verify enrolment for a student discount",
    "access_level": "verify",
    "expires_in_days": 30
  }
]`,
}

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  running: 'default',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
}

export function BulkOperations({
  orgId,
  jobs,
  disabled = false,
}: {
  orgId: string
  jobs: BulkJobSummary[]
  disabled?: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [kind, setKind] = useState<BulkJobKind>('credential_issue')
  const [raw, setRaw] = useState('')
  const [confirmCount, setConfirmCount] = useState('')
  const [failures, setFailures] = useState<Record<string, BulkJobRowResult[]>>({})

  let parsedRows: Record<string, unknown>[] | null = null
  let parseError: string | null = null
  if (raw.trim()) {
    try {
      const value = JSON.parse(raw)
      if (!Array.isArray(value)) throw new Error('Provide a JSON array of rows')
      parsedRows = value as Record<string, unknown>[]
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'Could not read that JSON'
    }
  }

  const rowCount = parsedRows?.length ?? 0
  const confirmed = confirmCount.trim() === String(rowCount) && rowCount > 0

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!parsedRows) return
    startTransition(async () => {
      try {
        const job = await createBulkJobAction(orgId, {
          kind,
          rows: parsedRows,
          confirmedCount: Number(confirmCount),
        })
        toast({
          title: 'Bulk job started',
          description: `${job.totalRows} row(s) queued. Progress appears below.`,
        })
        setRaw('')
        setConfirmCount('')
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not start the bulk job',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function loadFailures(jobId: string) {
    startTransition(async () => {
      try {
        const rows = await listFailedBulkRowsAction(orgId, { jobId })
        setFailures((current) => ({ ...current, [jobId]: rows }))
      } catch {
        toast({ title: 'Could not load failed rows', variant: 'destructive' })
      }
    })
  }

  function cancel(jobId: string) {
    startTransition(async () => {
      try {
        await cancelBulkJobAction(orgId, { jobId })
        toast({ title: 'Cancellation requested' })
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not cancel',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function retry(jobId: string) {
    startTransition(async () => {
      try {
        const job = await retryBulkJobAction(orgId, { jobId })
        toast({ title: `Retrying ${job.totalRows - job.succeededRows} row(s)` })
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not retry',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Bulk operations</h2>
        <p className="text-sm text-muted-foreground">
          Issue, revoke, or request across a whole cohort. Rows are processed one at a time, so
          a single bad row fails on its own and can be retried without repeating the rest.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="bulk-kind">Operation</Label>
          <select
            id="bulk-kind"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={kind}
            disabled={disabled}
            onChange={(event) => setKind(event.target.value as BulkJobKind)}
          >
            {Object.entries(BULK_JOB_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bulk-rows">Rows (JSON array, up to {MAX_BULK_ROWS})</Label>
          <Textarea
            id="bulk-rows"
            value={raw}
            disabled={disabled}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={PLACEHOLDERS[kind]}
            rows={10}
            className="font-mono text-xs"
          />
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          {parsedRows && (
            <p className="text-sm text-muted-foreground">
              {rowCount} row{rowCount === 1 ? '' : 's'} ready.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bulk-confirm">
            Type {rowCount || 'the row count'} to confirm
          </Label>
          <Input
            id="bulk-confirm"
            value={confirmCount}
            disabled={disabled || !parsedRows}
            onChange={(event) => setConfirmCount(event.target.value)}
            placeholder={String(rowCount || '')}
          />
          <p className="text-xs text-muted-foreground">
            This runs against every row you pasted. A revocation cannot be undone.
          </p>
        </div>

        <Button type="submit" disabled={disabled || isPending || !confirmed}>
          {isPending ? 'Starting...' : `Run on ${rowCount || 0} row(s)`}
        </Button>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Recent jobs</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bulk jobs yet.</p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {BULK_JOB_KIND_LABELS[job.kind] ?? job.kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={STATUS_TONE[job.status] ?? 'secondary'}>{job.status}</Badge>
                </div>

                <p className="text-sm">
                  {job.processedRows} of {job.totalRows} processed · {job.succeededRows}{' '}
                  succeeded · {job.failedRows} failed
                </p>

                <div className="flex flex-wrap gap-2">
                  {['pending', 'running'].includes(job.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => cancel(job.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {job.failedRows > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => loadFailures(job.id)}
                      >
                        Show failed rows
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => retry(job.id)}
                      >
                        Retry failed rows
                      </Button>
                    </>
                  )}
                </div>

                {failures[job.id] && failures[job.id].length > 0 && (
                  <ul className="divide-y rounded-md border text-sm">
                    {failures[job.id].map((row) => (
                      <li key={row.rowIndex} className="px-3 py-2">
                        <span className="font-medium">Row {row.rowIndex + 1}</span>
                        <span className="ml-2 text-muted-foreground">{row.error}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
