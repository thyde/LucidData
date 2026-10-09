'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StepUpDialog } from '@/components/auth/step-up-dialog'
import { useToast } from '@/lib/hooks/use-toast'
import { useTurnstile } from '@/lib/hooks/use-turnstile'
import { createClient } from '@/lib/supabase/client'
import { removePasskeyAction } from '@/lib/actions/account.actions'
import { removeRecoveryFactorAction } from '@/lib/actions/recovery.actions'
import { unwrap } from '@/lib/actions/unwrap'
import { enablePasskeyUnlock } from '@/lib/account/passkey-unlock'
import { stepUpWithPassword } from '@/lib/account/step-up'

export interface PasskeySummary {
  id: string
  credential_id: string
  device_name: string | null
  created_at: string
  last_used_at: string | null
  /** LD-112: the factor that lets this passkey open the vault, if it can. */
  unlock_factor_id: string | null
}

const nameOf = (passkey: PasskeySummary) => passkey.device_name ?? 'Unnamed device'

export function PasskeyList({ passkeys, keySalt }: { passkeys: PasskeySummary[]; keySalt: string | null }) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<PasskeySummary | null>(null)
  const [enabling, setEnabling] = useState<PasskeySummary | null>(null)
  const [disabling, setDisabling] = useState<PasskeySummary | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { attach: turnstileRef, getToken: getCaptchaToken } = useTurnstile('reauthenticate')

  if (passkeys.length === 0) return null

  function removeSelected() {
    if (!selected) return
    startTransition(async () => {
      try {
        await removePasskeyAction({ passkeyId: selected.id })
        toast({ title: 'Passkey removed' })
        setSelected(null)
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not remove passkey',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function closeEnable() {
    setEnabling(null)
    setPassword('')
    setError(null)
    setBusy(false)
  }

  async function enable(event: React.FormEvent) {
    event.preventDefault()
    if (!enabling) return
    if (!keySalt) {
      setError('Your encryption key is not set up yet. Add a vault entry first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser()
      if (!user?.email) throw new Error('Not signed in')
      // A new way into the vault, so the server needs a fresh password proof.
      const stepUpToken = await stepUpWithPassword('add_recovery_factor', user.email, password, await getCaptchaToken())
      if (!stepUpToken) {
        setError('Incorrect password')
        return
      }
      const done = await enablePasskeyUnlock({
        passkeyId: enabling.id,
        credentialId: enabling.credential_id,
        password,
        keySalt,
        stepUpToken,
      })
      if (!done) {
        setError(
          'This passkey cannot open your vault, because the device or browser does not support it. You can still sign in with it and enter your password.'
        )
        return
      }
      toast({ title: `${nameOf(enabling)} can now open your vault` })
      closeEnable()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The passkey could not be set up to open your vault.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="divide-y rounded-md border">
        {passkeys.map((passkey) => (
          <div key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              {/* A div, because the badge renders one. */}
              <div className="flex items-center gap-2 text-sm font-medium">
                {nameOf(passkey)}
                {passkey.unlock_factor_id && <Badge variant="secondary">Opens your vault</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                Added {new Date(passkey.created_at).toLocaleDateString()}
                {passkey.last_used_at && ` · Last used ${new Date(passkey.last_used_at).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {passkey.unlock_factor_id ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDisabling(passkey)}>
                  Stop opening the vault
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setEnabling(passkey)}>
                  Open the vault with it
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${passkey.device_name ?? 'unnamed passkey'}`}
                onClick={() => setSelected(passkey)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(enabling)} onOpenChange={(open) => !open && closeEnable()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open your vault with {enabling ? nameOf(enabling) : 'this passkey'}</DialogTitle>
            <DialogDescription>
              Signing in with this passkey will then open your vault without your password. Your
              device wraps a copy of your vault key with a secret only the passkey can produce, and
              the server never sees that secret. Enter your password to confirm, then use the passkey
              when your device asks.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={enable} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passkey-unlock-password">Password</Label>
              <Input
                id="passkey-unlock-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div ref={turnstileRef} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeEnable} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !password}>
                {busy ? 'Waiting for the passkey...' : 'Continue'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <StepUpDialog
        action="remove_recovery_factor"
        title="Stop opening the vault with this passkey"
        description={`${disabling ? nameOf(disabling) : 'This passkey'} will still sign you in, and you will enter your password to open the vault. Confirm your password to continue.`}
        open={Boolean(disabling)}
        onOpenChange={(open) => !open && setDisabling(null)}
        onConfirmed={async (stepUpToken) => {
          const passkey = disabling
          setDisabling(null)
          if (!passkey?.unlock_factor_id) return
          // The dialog has closed by now, so a failure is reported here.
          try {
            await unwrap(removeRecoveryFactorAction({ factorId: passkey.unlock_factor_id, stepUpToken }))
            toast({ title: `${nameOf(passkey)} no longer opens your vault` })
            router.refresh()
          } catch (e) {
            toast({
              title: 'Could not change this passkey',
              description: e instanceof Error ? e.message : undefined,
              variant: 'destructive',
            })
          }
        }}
      />

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.device_name ?? 'This device'} will no longer be able to sign in with its
              passkey{selected?.unlock_factor_id ? ' or open your vault' : ''}. Password sign-in and
              your other passkeys will continue to work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={removeSelected}>
              {isPending ? 'Removing…' : 'Remove passkey'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
