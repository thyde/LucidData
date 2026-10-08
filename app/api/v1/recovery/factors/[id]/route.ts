import { v1 } from '@/lib/api/v1/handler'
import { removeRecoveryFactor } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

export const DELETE = v1<{ id: string }>(async (_req, { userId, params }) => {
  await removeRecoveryFactor(userId, params.id)
  return { id: params.id, removed: true }
})
