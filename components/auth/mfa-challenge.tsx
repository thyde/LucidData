'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { redeemBackupCodeAction } from '@/lib/actions/mfa.actions'

// Prompts for a TOTP code and verifies the user's enrolled factor, elevating the
// current session to AAL2. Calls onVerified() on success.
export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [supabase] = useState(() => createClient())
  const [mode, setMode] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) throw listErr
      const factor = factors?.totp?.[0]
      if (!factor) {
        // Nothing enrolled to challenge against; let the caller continue.
        onVerified()
        return
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challenge.error) throw challenge.error
      const verify = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      })
      if (verify.error) throw verify.error
      onVerified()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not valid. Try again.')
      setBusy(false)
    }
  }

  async function submitBackup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { ok } = await redeemBackupCodeAction(code.trim())
      if (!ok) throw new Error('That backup code is not valid or has already been used.')
      // The TOTP factor was removed; refresh the session so the AAL guard clears.
      await supabase.auth.refreshSession()
      onVerified()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That backup code was not valid. Try again.')
      setBusy(false)
    }
  }

  function switchMode(next: 'totp' | 'backup') {
    setMode(next)
    setCode('')
    setError(null)
  }

  if (mode === 'backup') {
    return (
      <form onSubmit={submitBackup} className="space-y-4">
        <Input
          autoFocus
          autoComplete="one-time-code"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Backup code"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || code.trim().length < 4}>
          {busy ? 'Checking…' : 'Use backup code'}
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted-foreground hover:text-foreground"
          onClick={() => switchMode('totp')}
        >
          Use your authenticator code instead
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submitTotp} className="space-y-4">
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-label="Authentication code"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? 'Verifying…' : 'Verify'}
      </Button>
      <button
        type="button"
        className="w-full text-sm text-muted-foreground hover:text-foreground"
        onClick={() => switchMode('backup')}
      >
        Use a backup code instead
      </button>
    </form>
  )
}
