import { v1 } from '@/lib/api/v1/handler'
import { markNotificationRead } from '@/lib/services/notification.service'

export const dynamic = 'force-dynamic'

export const POST = v1<{ id: string }>(async (_req, { userId, params }) => {
  await markNotificationRead(params.id, userId)
  return { id: params.id, read: true }
})
