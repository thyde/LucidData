import { v1, readJson } from '@/lib/api/v1/handler'
import { recoveryFactorRemoveSchema } from '@luciddata/core/validations/client-api'
import { removeRecoveryFactor } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

/** Remove a recovery factor. Needs a step-up grant for remove_recovery_factor. */
export const DELETE = v1<{ id: string }>(async (req, { userId, params }) => {
  const { step_up_token } = recoveryFactorRemoveSchema.parse(await readJson(req))
  await removeRecoveryFactor(userId, params.id, step_up_token)
  return { id: params.id, removed: true }
})
