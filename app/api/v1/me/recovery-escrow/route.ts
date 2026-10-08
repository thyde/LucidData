import { v1, readJson } from '@/lib/api/v1/handler'
import { recoveryEscrowSchema } from '@luciddata/core/validations/client-api'
import { setRecoveryEscrow } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

/**
 * Store the recovery-code escrow: the master key wrapped on the device under a
 * key derived from a recovery code. The code itself never reaches the server.
 */
export const PUT = v1(async (req, { userId }) => {
  await setRecoveryEscrow(userId, recoveryEscrowSchema.parse(await readJson(req)))
  return { stored: true }
})
