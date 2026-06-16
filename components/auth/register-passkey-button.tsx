'use client'

import { useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RegisterPasskeyButtonProps {
  onRegistered?: () => void
}

export function RegisterPasskeyButton({ onRegistered }: RegisterPasskeyButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState('')

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    try {
      const optRes = await fetch('/api/auth/passkey/register-options', { method: 'POST' })
      const { options } = await optRes.json()

      const credential = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, deviceName: deviceName || undefined }),
      })
      const { verified } = await verifyRes.json()
      if (!verified) {
        setError('Passkey registration failed')
        return
      }
      onRegistered?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="device-name">Device name (optional)</Label>
        <Input
          id="device-name"
          value={deviceName}
          onChange={e => setDeviceName(e.target.value)}
          placeholder="e.g. MacBook Pro, iPhone"
        />
      </div>
      <Button type="button" onClick={handleRegister} disabled={loading}>
        {loading ? 'Registering...' : 'Register this device as passkey'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
