'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'

import { setEmailNotificationPreferenceAction } from '@/lib/actions/account.actions'
import { useToast } from '@/lib/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface NotificationPreferencesProps {
  emailNotificationsEnabled: boolean
}

export function NotificationPreferences({ emailNotificationsEnabled }: NotificationPreferencesProps) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(emailNotificationsEnabled)
  const [busy, setBusy] = useState(false)

  async function handleChange(next: boolean) {
    setBusy(true)
    setEnabled(next)
    try {
      await setEmailNotificationPreferenceAction({ enabled: next })
      toast({
        title: next ? 'Email notifications on' : 'Email notifications off',
        description: next
          ? 'We will email you when you get a credential or a request.'
          : 'You will still see in-app notifications.',
      })
    } catch (e) {
      setEnabled(!next)
      toast({
        title: 'Could not update preference',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Notifications</h2>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="email-notifications">Email me about activity</Label>
          <p className="text-sm text-muted-foreground">
            Get an email when you receive a credential or a request. In-app notifications stay on
            either way.
          </p>
        </div>
        <Switch
          id="email-notifications"
          checked={enabled}
          onCheckedChange={handleChange}
          disabled={busy}
          aria-label="Email notifications"
        />
      </div>
    </section>
  )
}
