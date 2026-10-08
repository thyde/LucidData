import { v1 } from '@/lib/api/v1/handler'
import { getNotifications, getUnreadCount } from '@/lib/services/notification.service'

export const dynamic = 'force-dynamic'

export const GET = v1(async (_req, { userId }) => {
  const [notifications, unread] = await Promise.all([getNotifications(userId), getUnreadCount(userId)])
  return { notifications, unread_count: unread }
})
