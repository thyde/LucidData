import { v1, readJson } from '@/lib/api/v1/handler'
import { accountDeleteSchema } from '@luciddata/core/validations/client-api'
import { deleteAccountConfirmed } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

/**
 * Delete the account. Needs the confirmation phrase typed out and a step-up
 * grant for `delete_account`. Returns the signed deletion receipt, which is
 * the person's proof of what was erased.
 */
export const DELETE = v1(async (req, { userId }) => {
  const { confirm_phrase, step_up_token } = accountDeleteSchema.parse(await readJson(req))
  return deleteAccountConfirmed(userId, confirm_phrase, step_up_token)
})
