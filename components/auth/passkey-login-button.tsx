'use client'

import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEncryption } from '@/lib/context/encryption-context'
import { openVaultWithPasskey, takePrfOutput, withPrfInputs } from '@/lib/account/passkey-unlock'
import { getPasskeyUnlockMaterialAction } from '@/lib/actions/recovery.actions'
import { unwrap } from '@/lib/actions/unwrap'

interface PasskeyLoginButtonProps {
  email: string
  /** Where to go once signed in and the vault is open. */
  redirectTo?: string
  onSuccess?: () => void
  onNeedEncryptionPassword?: (keySalt: string) => void
}

export function PasskeyLoginButton({
  email,
  redirectTo = '/dashboard',
  onSuccess,
  onNeedEncryptionPassword,
}: PasskeyLoginButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { unlockWithKey } = useEncryption()

  const handlePasskeyLogin = async () => {
    if (!email) {
      setError('Enter your email first')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Get authentication options
      const optRes = await fetch('/api/auth/passkey/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const { options, prf } = await optRes.json()
      if (!options) {
        setError('No passkey registered for this account')
        return
      }

      // Perform WebAuthn ceremony, asking a passkey that can open the vault for its PRF output
      const assertion = await startAuthentication({ optionsJSON: withPrfInputs(options, prf ?? {}) })
      // LD-112: the PRF output opens the vault, so it stays in this page.
      const { output: prfOutput, response: credential } = takePrfOutput(assertion)

      // The server checks the passkey belongs to this account and, if it
      // does, returns a single-use link for it.
      const verifyRes = await fetch('/api/auth/passkey/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      const { verified, token_hash: tokenHash } = await verifyRes.json()
      if (!verifyRes.ok || !verified || !tokenHash) {
        setError('Passkey verification failed')
        return
      }

      const { error: sessionError } = await createClient().auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      })
      if (sessionError) {
        setError('Passkey verification failed')
        return
      }

      // LD-112: open the vault with the passkey when it can, and fall back to
      // the password when it cannot.
      if (prfOutput) {
        const key = await unwrap(getPasskeyUnlockMaterialAction())
          .then((material) => openVaultWithPasskey(credential.id, prfOutput, material))
          .catch(() => null)
        if (key) {
          unlockWithKey(key)
          onSuccess?.()
          router.push(redirectTo)
          router.refresh()
          return
        }
      }

      // Get user's key_salt for vault unlock
      const profileRes = await fetch('/api/user/profile')
      const { data: profile } = await profileRes.json()
      if (profile?.key_salt && onNeedEncryptionPassword) {
        onNeedEncryptionPassword(profile.key_salt)
      } else {
        onSuccess?.()
        router.push(redirectTo)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handlePasskeyLogin}
        disabled={loading}
      >
        {loading ? 'Authenticating...' : 'Sign in with passkey'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
