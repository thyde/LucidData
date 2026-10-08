import { v1 } from '@/lib/api/v1/handler'
import { markAllNotificationsRead } from '@/lib/services/notification.service'

export const dynamic = 'force-dynamic'

export const POST = v1(async (_req, { userId }) => {
  await markAllNotificationsRead(userId)
  return { read: true }
})
