'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import { useEncryption } from '@/lib/context/encryption-context'
import { createClient } from '@/lib/supabase/client'
import { useTurnstile } from '@/lib/hooks/use-turnstile'
import {
  deriveMasterKey,
  EntriesUnderAnotherKeyError,
  prepareRewrap,
  setupRecoveryFromPassword,
  storeRewrap,
  vaultOpensWith,
} from '@/lib/account/account-crypto'
import { stepUpWithPassword } from '@/lib/account/step-up'
import { getRecoveryMaterialAction } from '@/lib/actions/recovery.actions'
import { unwrap } from '@/lib/actions/unwrap'
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display'

interface ChangePasswordFormProps {
  keySalt: string | null
}

/** What else stopped working, as one sentence, or nothing. */
function retiredNotice(kits: number, passkeys: number): string | null {
  if (kits > 0 && passkeys > 0) {
    return 'Your recovery kits stopped working and your passkeys no longer open your vault, so make a new kit and turn passkey unlock back on.'
  }
  if (kits > 0) return 'Your recovery kits stopped working, so make a new one.'
  if (passkeys > 0) return 'Your passkeys no longer open your vault, so turn this back on for each one under Passkeys.'
  return null
}

export function ChangePasswordForm({ keySalt }: ChangePasswordFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { unlock, holdWrites } = useEncryption()
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [retired, setRetired] = useState<string | null>(null)
  const { attach: turnstileRef, getToken: getCaptchaToken } = useTurnstile('reauthenticate')

  function reset() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setBusy(false)
    setNewCode(null)
    setRetired(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (!keySalt) {
      setError('Your encryption key is not set up yet')
      return
    }

    setBusy(true)
    let releaseWrites: (() => void) | null = null
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not signed in')

      // Supabase checks the current password in the browser. The server gets a
      // single-use grant to re-wrap the vault's keys, never the password.
      const stepUpToken = await stepUpWithPassword(
        'change_password',
        user.email,
        currentPassword,
        await getCaptchaToken()
      )
      if (!stepUpToken) {
        setError('Current password is incorrect')
        return
      }

      const oldMasterKey = await deriveMasterKey(currentPassword, keySalt)
      const newMasterKey = await deriveMasterKey(newPassword, keySalt)

      // Until the vault opens with the new key, anything this tab encrypted
      // would land under the old one, such as a synced record being drained.
      releaseWrites = holdWrites()

      // Work out every entry's new envelope before the password changes, so an
      // entry that cannot move stops the change instead of being stranded by it.
      try {
        await prepareRewrap(oldMasterKey, newMasterKey)
      } catch (prepareError) {
        if (prepareError instanceof EntriesUnderAnotherKeyError) {
          setError(
            'Some entries are locked with a password you used before. Restore them with your recovery code or kit first, then change your password.'
          )
          return
        }
        throw prepareError
      }

      // Update the Supabase password, then store the new envelopes.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(updateError.message)
        return
      }

      let kitsRetired = 0
      let passkeysRetired = 0
      try {
        // Prepare again from what is stored now, so an entry edited elsewhere
        // since the check above is not overwritten with its old data key.
        const prepared = await prepareRewrap(oldMasterKey, newMasterKey)
        ;({ retiredKits: kitsRetired, retiredPasskeys: passkeysRetired } = await storeRewrap(
          prepared,
          'password_change',
          stepUpToken
        ))
      } catch (rewrapError) {
        // The server may have stored the new wrapping before the error reached
        // the browser. Rolling the password back then would leave every entry
        // under a key that no password derives, so check before undoing anything.
        const stored = await unwrap(getRecoveryMaterialAction())
          .then((material) => vaultOpensWith(newMasterKey, material))
          .catch(() => false)
        if (!stored) {
          const { error: rollbackError } = await supabase.auth.updateUser({
            password: currentPassword,
          })
          if (rollbackError) {
            throw new Error(
              'Your password changed, but the vault could not be re-encrypted. Use your recovery code before signing out.'
            )
          }
          throw rewrapError
        }
      }

      let code: string | null = null
      try {
        code = await setupRecoveryFromPassword(newPassword, keySalt)
      } catch {
        toast({
          title: 'Password changed',
          description:
            'Your vault was re-encrypted, but a new recovery code could not be made. Make one under Recovery code.',
          variant: 'destructive',
        })
      }
      await unlock(newPassword, keySalt)

      const notice = retiredNotice(kitsRetired, passkeysRetired)
      setRetired(notice)
      if (code) setNewCode(code)
      else setOpen(false)
      toast({
        title: 'Password changed',
        description: ['Your vault was re-encrypted with the new password.', notice].filter(Boolean).join(' '),
      })
      // The passkey list and the recovery factors are rendered on the server.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
      releaseWrites?.()
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Password</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Changing your password re-encrypts your vault in the browser and issues a new recovery code.
        Recovery kits you made before stop working, and so does opening the vault with a passkey, so
        set those up again afterwards.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        Change password
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{newCode ? 'Save your new recovery code' : 'Change password'}</DialogTitle>
            <DialogDescription>
              {newCode
                ? ['Your password changed and your vault was re-encrypted. Save this new recovery code.', retired]
                    .filter(Boolean)
                    .join(' ')
                : 'Enter your current password and a new password.'}
            </DialogDescription>
          </DialogHeader>

          {newCode ? (
            <div className="space-y-4">
              <RecoveryCodeDisplay code={newCode} />
              <Button className="w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirm new password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div ref={turnstileRef} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Updating…' : 'Change password'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
