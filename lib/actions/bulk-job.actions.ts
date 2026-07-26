'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { requireVerifiedOrg } from '@/lib/middleware/requireVerifiedOrg'
import { assertRateLimit } from '@/lib/services/rate-limit.service'
import {
  cancelBulkJob,
  createBulkJob,
  listBulkJobs,
  listFailedRows,
  retryFailedRows,
  type BulkJobRowResult,
  type BulkJobSummary,
} from '@/lib/services/bulk-job.service'
import { bulkJobIdSchema, createBulkJobSchema } from '@/lib/validations/bulk'

/**
 * LD-604 bulk operation actions.
 *
 * Every one is scoped to organization membership, and creation additionally
 * requires a verified organization: an unverified org must not be able to reach
 * thousands of people in a single call any more than it can reach one.
 */

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function createBulkJobAction(
  orgId: string,
  input: unknown
): Promise<BulkJobSummary> {
  const userId = await getAuthenticatedUserId()
  await requireOrgMembership(orgId)

  const verified = await requireVerifiedOrg(orgId)
  if (!verified.ok) {
    throw new Error('Verify your organization before running bulk operations')
  }

  // A bulk job is the cheapest way to turn one mistake into thousands, so it is
  // throttled on the same bucket as single issuance.
  await assertRateLimit('credentialIssuance', orgId)

  const payload = createBulkJobSchema.parse(input)
  return createBulkJob(orgId, userId, payload)
}

export async function listBulkJobsAction(orgId: string): Promise<BulkJobSummary[]> {
  await requireOrgMembership(orgId)
  return listBulkJobs(orgId)
}

export async function listFailedBulkRowsAction(
  orgId: string,
  input: unknown
): Promise<BulkJobRowResult[]> {
  await requireOrgMembership(orgId)
  const { jobId } = bulkJobIdSchema.parse(input)
  return listFailedRows(orgId, jobId)
}

export async function cancelBulkJobAction(
  orgId: string,
  input: unknown
): Promise<BulkJobSummary> {
  const userId = await getAuthenticatedUserId()
  await requireOrgMembership(orgId)
  const { jobId } = bulkJobIdSchema.parse(input)
  const summary = await cancelBulkJob(orgId, userId, jobId)
  revalidatePath(`/org/${orgId}`)
  return summary
}

export async function retryBulkJobAction(
  orgId: string,
  input: unknown
): Promise<BulkJobSummary> {
  const userId = await getAuthenticatedUserId()
  await requireOrgMembership(orgId)
  const { jobId } = bulkJobIdSchema.parse(input)
  const summary = await retryFailedRows(orgId, userId, jobId)
  revalidatePath(`/org/${orgId}`)
  return summary
}
