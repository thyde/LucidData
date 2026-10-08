import { v1 } from '@/lib/api/v1/handler'
import { declineRecoverySetup } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

/**
 * Store data with no recovery factor, accepting that a forgotten password makes
 * the vault permanently unreadable. Recorded so it is never mistaken for an
 * oversight.
 */
export const POST = v1(async (_req, { userId }) => {
  await declineRecoverySetup(userId)
  return { declined: true }
})
