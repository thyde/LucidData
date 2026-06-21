'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import * as notif from '@/lib/services/notification.service'
import type { Notification } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getNotificationsAction(): Promise<Notification[]> {
  const userId = await getAuthenticatedUserId()
  return notif.getNotifications(userId)
}

export async function getUnreadCountAction(): Promise<number> {
  const userId = await getAuthenticatedUserId()
  return notif.getUnreadCount(userId)
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const validId = z.string().uuid().parse(id)
  return notif.markNotificationRead(validId, userId)
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const userId = await getAuthenticatedUserId()
  return notif.markAllNotificationsRead(userId)
}
