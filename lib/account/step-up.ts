'use client'

import { requestStepUpAction } from '@/lib/actions/session-security.actions'
import { unwrap } from '@/lib/actions/unwrap'
import { createPasswordProof } from '@/lib/supabase/verify-password'
import type { StepUpAction } from '@luciddata/core/validations/session-security'

/**
 * LD-106: turn a password the person just typed into a single-use grant for one
 * action. Supabase checks the password in the browser and the server receives
 * only proof of that check. Returns null when the password is wrong.
 *
 * For forms that already ask for the password, such as changing it or making a
 * recovery kit. Elsewhere, use StepUpDialog.
 */
export async function stepUpWithPassword(
  action: StepUpAction,
  email: string,
  password: string,
  captchaToken?: string
): Promise<string | null> {
  const proof = await createPasswordProof(email, password, captchaToken)
  if (!proof) return null
  const { token } = await unwrap(requestStepUpAction({ action, proof }))
  return token
}
