'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  listConsentRequestsForUser,
  respondToConsentRequest,
  type ConsentRequestWithOrg,
} from '@/lib/services/consent-request.service'
import type { ConsentRequest } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getConsentRequestsAction(): Promise<ConsentRequestWithOrg[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return listConsentRequestsForUser(userId)
  })
}

export async function respondToConsentRequestAction(
  requestId: string,
  response: 'approved' | 'denied',
  note?: string
): Promise<ConsentRequest | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return respondToConsentRequest(userId, requestId, response, note)
  })
}
