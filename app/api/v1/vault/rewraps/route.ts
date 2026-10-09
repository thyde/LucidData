import { v1, readJson } from '@/lib/api/v1/handler'
import { vaultRewrapStartSchema } from '@luciddata/core/validations/client-api'
import { beginVaultRewrap } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

/**
 * Start a re-wrap that arrives in parts, for a vault whose envelopes do not
 * fit in one request. Consumes a step-up grant for change_password. The
 * re-wrap lasts 30 minutes, and starting another drops this one.
 */
export const POST = v1(
  async (req, { userId }) => {
    const { reason, step_up_token } = vaultRewrapStartSchema.parse(await readJson(req))
    const { rewrapId } = await beginVaultRewrap(userId, reason, step_up_token)
    return { id: rewrapId }
  },
  { status: 201 }
)
