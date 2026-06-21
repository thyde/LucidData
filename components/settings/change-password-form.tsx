'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import { useEncryption } from '@/lib/context/encryption-context'
import { createClient } from '@/lib/supabase/client'
import { deriveMasterKey, rewrapAllEntries, setupRecoveryFromPassword } from '@/lib/account/account-crypto'
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display'

interface ChangePasswordFormProps {
  keySalt: string | null
}

export function ChangePasswordForm({ keySalt }: ChangePasswordFormProps) {
  const { toast } = useToast()
  const { unlock } = useEncryption()
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)

  function reset() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setBusy(false)
    setNewCode(null)
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
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not signed in')

      // Verify the current password.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (authError) {
        setError('Current password is incorrect')
        return
      }

      const oldMasterKey = await deriveMasterKey(currentPassword, keySalt)
      const newMasterKey = await deriveMasterKey(newPassword, keySalt)

      // Update the Supabase password, then re-wrap every entry's DEK with the new key.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(updateError.message)
        return
      }

      await rewrapAllEntries(oldMasterKey, newMasterKey, 'password_change')
      const code = await setupRecoveryFromPassword(newPassword, keySalt)
      await unlock(newPassword, keySalt)

      setNewCode(code)
      toast({ title: 'Password changed', description: 'Your vault was re-encrypted with the new password.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
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
                ? 'Your password changed and your vault was re-encrypted. Save this new recovery code.'
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
