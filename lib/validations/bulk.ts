import { z } from 'zod'
import { organizationCredentialIssueSchema } from '@/lib/validations/org-api'

/**
 * LD-604 bulk operations.
 *
 * A bulk operation amplifies a mistake by the size of the upload, so the limits
 * here are deliberately conservative and the confirmation step is not optional.
 */

/**
 * Rows per job. Large enough that graduation cohorts fit in one operation,
 * small enough that a mistaken paste is survivable and a single job cannot
 * monopolise the runner.
 */
export const MAX_BULK_ROWS = 5000

export const bulkJobKindSchema = z.enum([
  'credential_issue',
  'credential_revoke',
  'consent_request',
])
export type BulkJobKind = z.infer<typeof bulkJobKindSchema>

export const BULK_JOB_KIND_LABELS: Record<BulkJobKind, string> = {
  credential_issue: 'Issue credentials',
  credential_revoke: 'Revoke credentials',
  consent_request: 'Request consent',
}

/** One credential to issue. Same shape the single-issue endpoint accepts. */
export const bulkIssueRowSchema = organizationCredentialIssueSchema

export const bulkRevokeRowSchema = z.object({
  credential_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
})

export const bulkConsentRequestRowSchema = z.object({
  user_email: z.string().email(),
  purpose: z.string().min(10).max(500),
  access_level: z.enum(['read', 'export', 'verify']),
  expires_in_days: z.number().int().min(1).max(365).default(30),
})

const rowsFor = (kind: BulkJobKind) => {
  switch (kind) {
    case 'credential_issue':
      return z.array(bulkIssueRowSchema)
    case 'credential_revoke':
      return z.array(bulkRevokeRowSchema)
    case 'consent_request':
      return z.array(bulkConsentRequestRowSchema)
  }
}

export const createBulkJobSchema = z
  .object({
    kind: bulkJobKindSchema,
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_BULK_ROWS),
    // The operator has seen the affected count and typed it back. A bulk
    // revocation of the wrong cohort is not undoable.
    confirmedCount: z.number().int().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.confirmedCount !== value.rows.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmedCount'],
        message: `Confirm ${value.rows.length} rows to continue`,
      })
    }
    const result = rowsFor(value.kind).safeParse(value.rows)
    if (!result.success) {
      const first = result.error.issues[0]
      ctx.addIssue({
        code: 'custom',
        path: ['rows', ...first.path],
        message: `Row ${Number(first.path[0]) + 1}: ${first.message}`,
      })
    }
  })
export type CreateBulkJobInput = z.infer<typeof createBulkJobSchema>

export const bulkJobIdSchema = z.object({ jobId: z.string().uuid() })
