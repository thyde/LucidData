'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getReceiptsForConsent,
  getReceiptsForUser,
} from '@/lib/services/consent-receipt.service'
import type { ConsentReceipt } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/**
 * Receipts for one consent. Reads go through RLS, which admits the subject and
 * the named recipient organization, so no extra ownership check is needed here.
 */
export async function getConsentReceiptsAction(consentId: string): Promise<ConsentReceipt[]> {
  await getAuthenticatedUserId()
  return getReceiptsForConsent(consentId)
}

/** Every receipt belonging to the signed-in subject. */
export async function getMyConsentReceiptsAction(): Promise<ConsentReceipt[]> {
  const userId = await getAuthenticatedUserId()
  return getReceiptsForUser(userId)
}
