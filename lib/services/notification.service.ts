import { after } from 'next/server'
import * as repo from '@/lib/repositories/notification.repository'
import { getEmailNotificationsEnabled } from '@/lib/repositories/user.repository'
import { sendNotificationEmail } from '@/lib/services/notification-email.service'
import type { Notification } from '@/types/database.types'

export interface CreateNotificationInput {
  userId: string
  type: string
  title: string
  message: string
  relatedEntityId?: string | null
  relatedEntityType?: string | null
  // When set and an email transport is configured, also deliver by email.
  email?: string | null
}

// Map a notification's related entity to the in-app route the email should deep
// link to. Falls back to the dashboard for unknown types.
function deepLinkPathForEntity(relatedEntityType?: string | null): string {
  switch (relatedEntityType) {
    case 'credential_request':
      return '/requests'
    case 'consent_request':
      return '/requests'
    case 'issued_credential':
      return '/credentials'
    case 'consent':
      return '/consent'
    default:
      return '/dashboard'
  }
}

// Schedule best-effort email delivery after the response is sent so it never adds
// latency to the request. Outside a request scope (scripts, tests) after() throws,
// so fall back to a fire-and-forget call.
function deferEmailDelivery(task: () => Promise<void>): void {
  try {
    after(task)
  } catch {
    void task()
  }
}

// Create an in-app notification and, if configured, send an email. The in-app
// notification is the primary channel; email is deferred until after the response
// and never blocks or fails the request.
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await repo.insertNotification({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    related_entity_id: input.relatedEntityId ?? null,
    related_entity_type: input.relatedEntityType ?? null,
  })

  if (input.email) {
    const recipient = input.email
    const deepLinkPath = deepLinkPathForEntity(input.relatedEntityType)
    deferEmailDelivery(async () => {
      try {
        const enabled = await getEmailNotificationsEnabled(input.userId)
        if (!enabled) return // User opted out of email notifications.
        await sendNotificationEmail(recipient, {
          title: input.title,
          message: input.message,
          deepLinkPath,
        })
      } catch {
        // Best-effort: the in-app notification already landed.
      }
    })
  }
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  return repo.findByUserId(userId)
}

export async function getUnreadCount(userId: string): Promise<number> {
  return repo.countUnread(userId)
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  return repo.markRead(id, userId)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  return repo.markAllRead(userId)
}
