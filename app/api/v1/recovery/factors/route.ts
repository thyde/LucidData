import { v1, readJson } from '@/lib/api/v1/handler'
import { recoveryFactorAddSchema } from '@luciddata/core/validations/client-api'
import { addRecoveryFactor } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

/** Add a recovery code or recovery kit. Only the wrapped key and its salt are sent. */
export const POST = v1(
  async (req, { userId }) => {
    const input = recoveryFactorAddSchema.parse(await readJson(req))
    return addRecoveryFactor(userId, {
      type: input.type,
      label: input.label,
      wrappedMasterKey: input.wrapped_master_key,
      salt: input.salt,
    })
  },
  { status: 201 }
)
