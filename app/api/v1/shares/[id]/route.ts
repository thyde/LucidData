import { v1, notFound } from '@/lib/api/v1/handler'
import { revokeShare } from '@/lib/services/share.service'

export const dynamic = 'force-dynamic'

export const DELETE = v1<{ id: string }>(async (_req, { userId, params }) => {
  if (!(await revokeShare(userId, params.id))) return notFound()
  return { id: params.id, revoked: true }
})
