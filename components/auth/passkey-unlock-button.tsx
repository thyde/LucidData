'use client'

import { useState, useSyncExternalStore } from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { usePasskeyUnlockAvailable } from '@/components/auth/passkey-unlock-provider'
import { useEncryption } from '@/lib/context/encryption-context'
import { unlockWithPasskey } from '@/lib/account/passkey-unlock'

/** Passkey support does not change while the page is open. */
const noChanges = () => () => undefined

/**
 * LD-112: open a locked vault with a passkey, without signing in again. A
 * reload clears the key from memory but not the session, so a passkey that can
 * open the vault brings it back in one step. Renders nothing when none can, or
 * when the browser has no passkey support.
 */
export function PasskeyUnlockButton({ variant = 'outline' }: { variant?: 'default' | 'outline' }) {
  const available = usePasskeyUnlockAvailable()
  const { unlockWithKey } = useEncryption()
  // The server render cannot know what the browser supports, so it assumes nothing.
  const supported = useSyncExternalStore(noChanges, browserSupportsWebAuthn, () => false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!available || !supported) return null

  async function open() {
    setBusy(true)
    setError(null)
    try {
      const key = await unlockWithPasskey()
      if (key) unlockWithKey(key)
      else setError('That passkey could not open your vault. Sign in with your password instead.')
    } catch {
      setError('The passkey was not used. Try again, or sign in with your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button type="button" variant={variant} onClick={open} disabled={busy}>
        {busy ? 'Opening...' : 'Open with a passkey'}
      </Button>
      {error && (
        <p role="alert" className="max-w-sm text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
