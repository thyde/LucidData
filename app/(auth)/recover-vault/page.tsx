'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/utils/network-errors'
import { useEncryption } from '@/lib/context/encryption-context'
import { useTurnstile } from '@/lib/hooks/use-turnstile'
import {
  getPasskeyUnlockMaterialAction,
  getRecoveryMaterialAction,
  retirePasskeyUnlocksAction,
} from '@/lib/actions/recovery.actions'
import { unlockWithPasskey } from '@/lib/account/passkey-unlock'
import type { PasskeyUnlockMaterial } from '@/lib/services/recovery-factor.service'
import {
  deriveMasterKey,
  EntriesUnderAnotherKeyError,
  openVaultWithRecoverySecret,
  prepareRewrap,
  setupRecoveryFromPassword,
  storeRewrap,
  vaultHasContent,
  vaultOpensWith,
  type PreparedRewrap,
} from '@/lib/account/account-crypto'
import { stepUpWithPassword } from '@/lib/account/step-up'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display'
import { unwrap } from '@/lib/actions/unwrap'

/** Passkey support does not change while the page is open. */
const noChanges = () => () => undefined

export default function RecoverVaultPage() {
  const router = useRouter()
  const { unlock } = useEncryption()
  const [ready, setReady] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoverySecret, setRecoverySecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  // LD-112: a passkey that opens the vault can restore it, as a code or kit can.
  const [passkeyMaterial, setPasskeyMaterial] = useState<PasskeyUnlockMaterial | null>(null)
  const [passkeyKey, setPasskeyKey] = useState<CryptoKey | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  // Set once the person has been told what resetting without restoring does to their passkeys.
  const [skipWarning, setSkipWarning] = useState<'with_code' | 'without_code' | null>(null)
  const webAuthn = useSyncExternalStore(noChanges, browserSupportsWebAuthn, () => false)
  const { attach: turnstileRef, getToken: getCaptchaToken } = useTurnstile('reauthenticate')

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

  // Read ahead of the click, so the passkey prompt opens with nothing awaited first.
  useEffect(() => {
    if (!ready) return
    let active = true
    unwrap(getPasskeyUnlockMaterialAction())
      .then((material) => {
        if (active) setPasskeyMaterial(material)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [ready])

  const passkeyCanRestore =
    webAuthn && passkeyMaterial !== null && passkeyMaterial.passkeys.length > 0 && vaultHasContent(passkeyMaterial)
  // The next submit resets without restoring, after the warning.
  const skipping = skipWarning !== null && !passkeyKey && recoverySecret.trim() === ''

  async function restoreWithPasskey() {
    if (!passkeyMaterial) return
    setPasskeyBusy(true)
    setError(null)
    try {
      const key = await unlockWithPasskey(passkeyMaterial)
      if (key) {
        setPasskeyKey(key)
        setRecoverySecret('')
        setSkipWarning(null)
      } else {
        setError('That passkey cannot restore your vault. Use your recovery code or kit instead.')
      }
    } catch {
      setError('The passkey was not used. Try again, or use your recovery code or kit.')
    } finally {
      setPasskeyBusy(false)
    }
  }

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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.email) {
        setError('Your reset link has expired. Request a new one.')
        return
      }

      const material = await unwrap(getRecoveryMaterialAction())
      const keySalt = material.key_salt
      const secret = recoverySecret.trim()
      const newMasterKey = keySalt ? await deriveMasterKey(newPassword, keySalt) : null

      // An earlier attempt may have restored the vault under this password and
      // stopped before it finished, which leaves nothing to recover.
      const alreadyOpen = newMasterKey !== null && (await vaultOpensWith(newMasterKey, material))
      // Null when the passkeys could not be read, which is not the same as none.
      const freshPasskeys = await unwrap(getPasskeyUnlockMaterialAction()).catch(() => null)
      if (freshPasskeys) setPasskeyMaterial(freshPasskeys)
      const passkeyCopies = (freshPasskeys ?? passkeyMaterial)?.passkeys.length ?? null

      // Check the code or kit before changing anything, so a typo never leaves
      // the password changed and the vault still closed.
      let oldMasterKey: CryptoKey | null = null
      let connectorKeyLost = false
      if (newMasterKey && passkeyKey && !alreadyOpen) {
        // The passkey's copy was checked against the vault when it opened.
        oldMasterKey = passkeyKey
      } else if (newMasterKey && secret && !alreadyOpen) {
        const attempt = await openVaultWithRecoverySecret(secret, material)
        if (attempt.status === 'not_a_secret') {
          setError(
            'That is not a recovery code or a recovery kit. A code has 25 characters and a kit has 32, not counting dashes.'
          )
          return
        }
        if (attempt.status === 'no_match') {
          setError(
            'That recovery code or kit does not open this vault. Check it and try again. A kit made before your last password change no longer works.'
          )
          return
        }
        oldMasterKey = attempt.masterKey
        connectorKeyLost = attempt.connectorKeyLost
      }

      // Resetting without restoring retires the passkeys' copies, and they may
      // be the only way back to the data, so ask before changing anything, and
      // do not go on without knowing whether there are any.
      if (!oldMasterKey && !alreadyOpen && keySalt && vaultHasContent(material)) {
        if (passkeyCopies === null) {
          setError('Your passkeys could not be checked, so nothing was changed. Try again.')
          return
        }
        if (passkeyCopies > 0 && !skipWarning) {
          setSkipWarning(material.escrow !== null || material.factors.length > 0 ? 'with_code' : 'without_code')
          return
        }
      }

      // Work out every entry's new envelope before the password changes, so an
      // entry that cannot move stops the reset instead of being stranded by it.
      let prepared: PreparedRewrap | null = null
      if (newMasterKey && oldMasterKey) {
        try {
          prepared = await prepareRewrap(oldMasterKey, newMasterKey)
        } catch (prepareError) {
          if (prepareError instanceof EntriesUnderAnotherKeyError) {
            setError(
              'Some entries were saved after an earlier password reset and are locked with the password you set then. Enter that password as your new password to restore everything.'
            )
            return
          }
          throw prepareError
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      // Trying again after an earlier attempt sends the same password a second time.
      if (updateError && updateError.code !== 'same_password') {
        setError(getAuthErrorMessage(updateError))
        return
      }

      // An empty vault has nothing to restore, but its recovery factors still
      // wrap the key the forgotten password derived. Retire them and make a new
      // code, the same way a restore does. A vault with no entries can still
      // hold a connector key, and then the factors are its only way back.
      const emptyVault = keySalt !== null && !vaultHasContent(material)
      if (keySalt && newMasterKey && (prepared || emptyVault)) {
        // Re-wrapping the vault's keys needs a fresh password proof, and the new
        // password is the one to prove. Supabase checks it in the browser.
        const stepUpToken = await stepUpWithPassword(
          'change_password',
          user.email,
          newPassword,
          await getCaptchaToken()
        )
        if (!stepUpToken) throw new Error('Your new password could not be confirmed. Try again.')

        // Prepare again from what is stored now: the check above may be minutes
        // old, and an entry edited on another device since then must not be
        // overwritten with its old data key.
        const fresh =
          oldMasterKey && newMasterKey
            ? await prepareRewrap(oldMasterKey, newMasterKey)
            : { entries: [], ingestKey: null }
        const { count, retiredKits, retiredPasskeys } = await storeRewrap(
          fresh,
          prepared ? 'recovery' : 'password_change',
          stepUpToken
        )
        const freshCode = await setupRecoveryFromPassword(newPassword, keySalt).catch(() => null)
        await unlock(newPassword, keySalt)

        setNewCode(freshCode)
        setDoneMessage(
          [
            prepared && count > 0
              ? `Your password was reset and ${count} vault ${count === 1 ? 'entry was' : 'entries were'} restored.`
              : prepared && fresh.ingestKey
                ? 'Your password was reset, and records from your connected sources can still be opened.'
                : 'Your password was reset. Your vault has no entries yet, so a new recovery code replaces the old one.',
            retiredKits > 0 ? 'Your recovery kits stopped working, so make a new one in Settings.' : null,
            retiredPasskeys > 0
              ? 'Your passkeys no longer open your vault, so turn this back on for each one in Settings.'
              : null,
            connectorKeyLost
              ? 'Records your connected sources sent under an earlier password cannot be opened any more.'
              : null,
            freshCode ? null : 'A new recovery code could not be made. Make one in Settings.',
          ]
            .filter(Boolean)
            .join(' ')
        )
      } else if (keySalt && alreadyOpen) {
        // The vault was restored before. Make sure it has a recovery code again.
        const freshCode = material.escrow
          ? null
          : await setupRecoveryFromPassword(newPassword, keySalt).catch(() => null)
        await unlock(newPassword, keySalt)
        setNewCode(freshCode)
        setDoneMessage('Your password was reset and your vault opens with it.')
      } else if (!keySalt) {
        setDoneMessage('Your password was reset.')
      } else {
        // LD-112: the passkeys' copies wrap the key the vault is still under,
        // which the new password does not make. Left in place, a passkey session
        // would go on writing under one key while a password session writes
        // under another. The person was told, and chose not to restore.
        let passkeysRetired: boolean | null = null
        if ((passkeyCopies ?? 0) > 0) {
          const grant = await stepUpWithPassword(
            'remove_recovery_factor',
            user.email,
            newPassword,
            await getCaptchaToken()
          ).catch(() => null)
          passkeysRetired = grant
            ? await unwrap(retirePasskeyUnlocksAction({ stepUpToken: grant })).then(
                () => true,
                () => false
              )
            : false
        }

        const canRecover = material.escrow !== null || material.factors.length > 0
        const what = material.probe ? 'your encrypted vault' : 'the data your connected sources sent'
        setDoneMessage(
          [
            canRecover
              ? `Your password was reset. Enter your recovery code or kit to also restore ${what}, or continue to your dashboard.`
              : `Your password was reset. ${material.probe ? 'Your existing vault data' : 'Data your connected sources sent'} cannot be decrypted without a recovery code or kit, but you can keep using your account.`,
            passkeysRetired === true ? 'Your passkeys no longer open your vault.' : null,
            passkeysRetired === false
              ? 'Your passkeys could not be updated, so turn off opening the vault for each one in Settings.'
              : null,
          ]
            .filter(Boolean)
            .join(' ')
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
        <CardTitle as="h1" className="text-2xl font-bold text-center">Recover your vault</CardTitle>
        <CardDescription className="text-center">
          {passkeyCanRestore
            ? 'Set a new password and restore your encrypted data with your passkey, or with your recovery code or kit.'
            : 'Set a new password and enter your recovery code or kit to restore your encrypted data.'}
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
          <Link href="/forgot-password" className="text-sm text-primary underline">
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
            {passkeyCanRestore && (
              <div className="space-y-2 rounded-md border p-3">
                {passkeyKey ? (
                  <p role="status" className="text-sm">
                    Your passkey opened your vault. Choose a new password, then select Reset password to
                    finish restoring it.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      A passkey on this account can open your vault, so you can use it to restore your
                      data instead of a recovery code.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={restoreWithPasskey}
                      disabled={passkeyBusy || busy}
                    >
                      {passkeyBusy ? 'Waiting for the passkey...' : 'Restore with a passkey'}
                    </Button>
                  </>
                )}
              </div>
            )}
            {!passkeyKey && (
              <div className="space-y-2">
                <Label htmlFor="recovery-secret">Recovery code or kit</Label>
                <Input
                  id="recovery-secret"
                  value={recoverySecret}
                  onChange={(e) => setRecoverySecret(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="recovery-secret-help"
                />
                <p id="recovery-secret-help" className="text-xs text-muted-foreground">
                  Enter your recovery code, or the secret from your recovery kit file, to restore your
                  encrypted vault. Leave it blank to reset only your password.
                </p>
              </div>
            )}
            {skipping && (
              <div role="alert" className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                {skipWarning === 'with_code'
                  ? 'A passkey that opens your vault can restore it. If you reset your password without restoring, your passkeys stop opening your vault, and your data stays locked until you use your recovery code or kit.'
                  : 'A passkey that opens your vault can restore it. If you reset your password without restoring, your passkeys stop opening your vault, and your data cannot be decrypted, because you have no recovery code or kit.'}
              </div>
            )}
            <div ref={turnstileRef} />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Recovering…' : skipping ? 'Reset without restoring' : 'Reset password'}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}
