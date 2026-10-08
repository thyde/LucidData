'use server'

import { z } from 'zod'
import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import * as legal from '@/lib/services/legal.service'
import { INDIVIDUAL_DOCUMENTS } from '@/lib/constants/legal'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user
}

export async function getLegalStatusAction(): Promise<legal.LegalStatus | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthenticatedUser()
    return legal.getLegalStatus(user.id)
  })
}

const acceptDocumentsSchema = z.object({
  documents: z.array(z.enum(INDIVIDUAL_DOCUMENTS)).min(1),
})

/** LD-110: accept the current versions after a change, from the prompt. */
export async function acceptLegalDocumentsAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthenticatedUser()
    const { documents } = acceptDocumentsSchema.parse(input)
    return legal.acceptDocuments(user.id, documents)
  })
}

/**
 * Record what the person agreed to on the registration form. The choices come
 * from their own sign-up metadata, read here on the server rather than sent by
 * the browser, and the time is when the account was created.
 */
export async function recordRegistrationChoicesAction(): Promise<string[] | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthenticatedUser()
    return legal.recordRegistrationChoices(user.id, user.user_metadata, user.created_at)
  })
}

const healthConsentSchema = z.object({
  source: z.enum(['settings', 'health-gate']),
})

export async function grantHealthDataConsentAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthenticatedUser()
    const { source } = healthConsentSchema.parse(input)
    return legal.grantHealthDataConsent(user.id, source)
  })
}

export async function withdrawHealthDataConsentAction(): Promise<{ disconnected: number } | ActionFailure> {
  return guarded(async () => {
    const user = await getAuthenticatedUser()
    return legal.withdrawHealthDataConsent(user.id)
  })
}
