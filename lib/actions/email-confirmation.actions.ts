'use server'

import { redirect } from 'next/navigation'
import { confirmEmailAddress } from '@/lib/services/email-confirmation.service'
import { confirmEmailSchema } from '@luciddata/core/validations/account'

/**
 * LD-610: the confirm-email page's form action. It needs no session, because
 * the link is the proof, and it reports the outcome on the sign-in page.
 *
 * The page asks for a click before this runs. Mail scanners open links to check
 * them, and a link that confirmed on a plain visit would be spent by the
 * scanner before the person ever saw it.
 */
export async function confirmEmailAction(formData: FormData): Promise<void> {
  const parsed = confirmEmailSchema.safeParse({
    tokenHash: formData.get('token_hash'),
    type: formData.get('type'),
  })
  const confirmed = parsed.success
    ? await confirmEmailAddress(parsed.data.tokenHash, parsed.data.type)
    : false
  redirect(confirmed ? '/login?confirmed=1' : '/login?confirmed=invalid')
}
