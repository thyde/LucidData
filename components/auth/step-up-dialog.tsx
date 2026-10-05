'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestStepUpAction } from '@/lib/actions/session-security.actions'
import type { StepUpAction } from '@/lib/services/session-security.service'
import { unwrap } from '@/lib/actions/unwrap'
import { createClient } from '@/lib/supabase/client'
import { createPasswordProof } from '@/lib/supabase/verify-password'
import { useTurnstile } from '@/lib/hooks/use-turnstile'

/**
 * LD-106: re-authentication for one sensitive action.
 *
 * The password is checked by Supabase in the browser. The server receives proof
 * of that check, never the password. The grant it returns is single use and
 * names the action, so it cannot be cached and reused for something else.
 * Callers must request a fresh one each time.
 */
export function StepUpDialog({
  action,
  title,
  description,
  open,
  onOpenChange,
  onConfirmed,
}: {
  action: StepUpAction
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmed: (token: string) => void | Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { attach: turnstileRef, getToken: getCaptchaToken } = useTurnstile('reauthenticate')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser()
      if (!user?.email) throw new Error('Your session has ended. Sign in again.')

      const proof = await createPasswordProof(user.email, password, await getCaptchaToken())
      if (!proof) {
        setError('Incorrect password')
        return
      }

      const { token } = await unwrap(requestStepUpAction({ action, proof }))
      setPassword('')
      onOpenChange(false)
      await onConfirmed(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setPassword('')
          setError(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`step-up-${action}`}>Password</Label>
            <Input
              id={`step-up-${action}`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          <div ref={turnstileRef} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || password.length === 0}>
            {busy ? 'Confirming...' : 'Confirm'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
