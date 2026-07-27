'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as rights from '@/lib/services/rights.service'
import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import {
  appealRightsCaseSchema,
  fileRightsRequestSchema,
  withdrawRightsCaseSchema,
} from '@/lib/validations/rights'

/**
 * LD-301 rights actions.
 *
 * Filing, withdrawing, and appealing are the person's own. Advancing a case
 * (pause, resume, extend, resolve) is operator work and has no action here on
 * purpose: a person must not be able to mark their own request fulfilled.
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

export async function fileRightsRequestAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const payload = fileRightsRequestSchema.parse(input)
    await rights.fileRequest(userId, payload)
    revalidatePath('/privacy')
  })
}

export async function listRightsCasesAction(): Promise<rights.RightsCaseView[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return rights.listCases(userId)  })
}

export async function withdrawRightsCaseAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { caseId } = withdrawRightsCaseSchema.parse(input)
    await rights.withdrawCase(userId, caseId)
    revalidatePath('/privacy')
  })
}

export async function appealRightsCaseAction(input: unknown): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const { caseId, detail } = appealRightsCaseSchema.parse(input)
    await rights.appealCase(userId, caseId, detail)
    revalidatePath('/privacy')
  })
}
