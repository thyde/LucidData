'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/utils/network-errors'
import { useEncryption } from '@/lib/context/encryption-context'
import { getAccountSecurityAction } from '@/lib/actions/account.actions'
import {
  recoverOldMasterKey,
  deriveMasterKey,
  rewrapAllEntries,
  setupRecoveryFromPassword,
} from '@/lib/account/account-crypto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display'

export default function RecoverVaultPage() {
  const router = useRouter()
  const { unlock } = useEncryption()
  const [ready, setReady] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(getAuthErrorMessage(updateError))
        return
      }

      const security = await getAccountSecurityAction()
      const canRecoverVault =
        !!security?.key_salt && !!security?.wrapped_master_key && !!security?.recovery_code_salt

      if (canRecoverVault && recoveryCode.trim()) {
        let oldMasterKey: CryptoKey
        try {
          oldMasterKey = await recoverOldMasterKey(
            recoveryCode,
            security!.wrapped_master_key!,
            security!.recovery_code_salt!
          )
        } catch {
          setError('That recovery code did not work. Check it and try again.')
          return
        }

        const newMasterKey = await deriveMasterKey(newPassword, security!.key_salt!)
        const count = await rewrapAllEntries(oldMasterKey, newMasterKey, 'recovery')
        const freshCode = await setupRecoveryFromPassword(newPassword, security!.key_salt!)
        await unlock(newPassword, security!.key_salt!)

        setNewCode(freshCode)
        setDoneMessage(
          `Your password was reset and ${count} vault ${count === 1 ? 'entry' : 'entries'} restored.`
        )
      } else {
        setDoneMessage(
          canRecoverVault
            ? 'Your password was reset. Enter your recovery code to also restore your encrypted vault, or continue to your dashboard.'
            : 'Your password was reset. Your existing vault data cannot be decrypted without a recovery code, but you can keep using your account.'
        )
      }
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Recover your vault</CardTitle>
        <CardDescription className="text-center">
          Set a new password and enter your recovery code to restore your encrypted data.
        </CardDescription>
      </CardHeader>

      {doneMessage ? (
        <CardContent className="space-y-4">
          <div role="status" className="bg-muted text-sm p-3 rounded-md">
            {doneMessage}
          </div>
          {newCode && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Your new recovery code</p>
              <RecoveryCodeDisplay code={newCode} />
            </div>
          )}
          <Button
            className="w-full"
            onClick={() => {
              router.push('/dashboard')
              router.refresh()
            }}
          >
            Continue to dashboard
          </Button>
        </CardContent>
      ) : !ready ? (
        <CardContent className="space-y-4">
          <div role="status" className="bg-muted text-sm p-3 rounded-md">
            Open the password reset link from your email on this device to continue. If you arrived
            here directly, request a new link.
          </div>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Request a reset link
          </Link>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            {error && (
              <div role="alert" className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
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
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recovery-code">Recovery code</Label>
              <Input
                id="recovery-code"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              />
              <p className="text-xs text-muted-foreground">
                Enter your recovery code to restore your encrypted vault. Leave blank to reset only
                your password.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Recovering…' : 'Reset password'}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}
