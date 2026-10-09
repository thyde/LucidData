'use server'

import { guarded, UserFacingError, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  createHealthShare,
  listHealthShares,
  revokeHealthShare,
  type CreatedHealthShare,
  type HealthShareSummary,
} from '@/lib/services/health-share.service'
import { createHealthShareSchema, healthShareIdSchema } from '@luciddata/core/validations/health-share'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/**
 * LD-305. The summary arrives already encrypted on the person's device; the
 * key stays there and in the link. The dialog checks everything first, so a
 * refusal here names what was wrong rather than being sanitized away.
 */
export async function createHealthShareAction(input: unknown): Promise<CreatedHealthShare | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const parsed = createHealthShareSchema.safeParse(input)
    if (!parsed.success) {
      throw new UserFacingError(`This summary was not shared. ${parsed.error.issues[0].message}`, 'invalid_input')
    }
    return createHealthShare(userId, parsed.data)
  })
}

export async function listHealthSharesAction(): Promise<HealthShareSummary[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return listHealthShares(userId)
  })
}

export async function revokeHealthShareAction(input: unknown): Promise<HealthShareSummary | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const parsed = healthShareIdSchema.safeParse(input)
    if (!parsed.success) throw new UserFacingError('This shared summary no longer exists.', 'not_found')
    return revokeHealthShare(userId, parsed.data.shareId)
  })
}
