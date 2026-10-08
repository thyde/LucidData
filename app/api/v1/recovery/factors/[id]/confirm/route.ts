import { v1 } from '@/lib/api/v1/handler'
import { confirmRecoveryFactor } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

/** The person confirms they still hold this factor. */
export const POST = v1<{ id: string }>(async (_req, { userId, params }) => {
  await confirmRecoveryFactor(userId, params.id)
  return { id: params.id, confirmed: true }
})
