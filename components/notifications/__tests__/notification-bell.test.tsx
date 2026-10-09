import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/helpers/render'
import { NotificationBell } from '../notification-bell'
import type { Notification } from '@/types/database.types'

vi.mock('@/lib/actions/notification.actions', () => ({
  getNotificationsAction: vi.fn(async () => []),
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    removeChannel: vi.fn(),
  }),
}))

import { getNotificationsAction } from '@/lib/actions/notification.actions'

const note = (id: string, read: boolean) =>
  ({ id, user_id: 'user-1', title: 'A request', message: 'Someone asked for access', read, created_at: '2026-10-09T08:00:00Z' }) as unknown as Notification

beforeEach(() => vi.clearAllMocks())

describe('NotificationBell', () => {
  it('shows notifications read with the page without asking the server again', () => {
    render(<NotificationBell initialNotifications={[note('n1', false), note('n2', true)]} />)

    expect(screen.getByRole('button', { name: 'Notifications (1 unread)' })).toBeInTheDocument()
    // A server action at mount would queue in front of the page's own.
    expect(getNotificationsAction).not.toHaveBeenCalled()
  })

  it('loads them itself when the page could not', async () => {
    render(<NotificationBell />)

    await vi.waitFor(() => expect(getNotificationsAction).toHaveBeenCalledTimes(1))
  })
})
