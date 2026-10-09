'use client'

import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface PasskeyLoginButtonProps {
  email: string
  onSuccess?: () => void
  onNeedEncryptionPassword?: (keySalt: string) => void
}

export function PasskeyLoginButton({ email, onSuccess, onNeedEncryptionPassword }: PasskeyLoginButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

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
      const { options } = await optRes.json()
      if (!options) {
        setError('No passkey registered for this account')
        return
      }

      // Perform WebAuthn ceremony
      const credential = await startAuthentication({ optionsJSON: options })

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

      // Get user's key_salt for vault unlock
      const profileRes = await fetch('/api/user/profile')
      const { data: profile } = await profileRes.json()
      if (profile?.key_salt && onNeedEncryptionPassword) {
        onNeedEncryptionPassword(profile.key_salt)
      } else {
        onSuccess?.()
        router.push('/dashboard')
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
