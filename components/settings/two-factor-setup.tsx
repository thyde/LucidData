'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import {
  generateBackupCodesAction,
  getBackupCodesStatusAction,
  completeTwoFactorEnrollmentAction,
  recordTwoFactorDisabledAction,
} from '@/lib/actions/mfa.actions'

type Mode = 'idle' | 'enroll' | 'disable'

// Manages TOTP two-factor authentication via Supabase Auth MFA. Enrollment and
// verification happen entirely against the user's own session in the browser.
export function TwoFactorSetup() {
  const { toast } = useToast()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    const on = !error && (data?.totp?.length ?? 0) > 0
    setEnabled(on)
    if (on) {
      try {
        const { remaining } = await getBackupCodesStatusAction()
        setRemaining(remaining)
      } catch {
        setRemaining(null)
      }
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function startEnroll() {
    setError(null)
    setBusy(true)
    try {
      // Clear any stale unverified factors so re-enrolling stays clean.
      const { data: list } = await supabase.auth.mfa.listFactors()
      const stale = (list?.all ?? []).filter(
        (f) => f.factor_type === 'totp' && f.status !== 'verified'
      )
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) throw error
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setCode('')
      setMode('enroll')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start setup.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll() {
    if (!factorId) return
    setError(null)
    setBusy(true)
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) throw challenge.error
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      })
      if (verify.error) throw verify.error
      const { codes } = await completeTwoFactorEnrollmentAction()
      setBackupCodes(codes)
      toast({ title: 'Two-factor authentication enabled' })
      setMode('idle')
      setFactorId(null)
      setQrCode(null)
      setSecret(null)
      setCode('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not valid. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEnroll() {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId }).catch(() => {})
    setMode('idle')
    setFactorId(null)
    setQrCode(null)
    setSecret(null)
    setCode('')
    setError(null)
  }

  async function confirmDisable() {
    setError(null)
    setBusy(true)
    try {
      const { data: list, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) throw listErr
      const factor = list?.totp?.[0]
      if (!factor) {
        setEnabled(false)
        setMode('idle')
        return
      }
      // Require a current code (elevates the session to AAL2) before removing it.
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challenge.error) throw challenge.error
      const verify = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      })
      if (verify.error) throw verify.error
      const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (unErr) throw unErr
      await recordTwoFactorDisabledAction().catch(() => {})
      toast({ title: 'Two-factor authentication disabled' })
      setMode('idle')
      setCode('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not valid. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function regenerate() {
    setError(null)
    setBusy(true)
    try {
      const { codes } = await generateBackupCodesAction()
      setBackupCodes(codes)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate codes.')
    } finally {
      setBusy(false)
    }
  }

  function copyCodes() {
    if (backupCodes) navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {})
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking status…</p>
  }

  if (backupCodes) {
    return (
      <div className="space-y-4 rounded-md border p-4">
        <div>
          <p className="text-sm font-medium">Save your backup codes</p>
          <p className="text-sm text-muted-foreground">
            Each code works once if you lose your authenticator. Store them somewhere safe; they will
            not be shown again.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded bg-muted p-3 font-mono text-sm">
          {backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copyCodes}>
            <Copy className="h-4 w-4" />
            Copy codes
          </Button>
          <Button size="sm" onClick={() => setBackupCodes(null)}>
            I have saved them
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'enroll') {
    return (
      <div className="space-y-4 rounded-md border p-4">
        <p className="text-sm">
          Scan this QR code with an authenticator app (e.g. 1Password, Authy, Google
          Authenticator), then enter the 6-digit code to confirm.
        </p>
        {qrCode && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrCode} alt="Two-factor QR code" className="h-44 w-44 rounded bg-white p-2" />
        )}
        {secret && (
          <p className="text-xs text-muted-foreground">
            Or enter this key manually: <span className="font-mono">{secret}</span>
          </p>
        )}
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-40"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={confirmEnroll} disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify & enable'}
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelEnroll} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'disable') {
    return (
      <div className="space-y-4 rounded-md border p-4">
        <p className="text-sm">Enter a current code from your authenticator app to turn off 2FA.</p>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-40"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={confirmDisable}
            disabled={busy || code.length !== 6}
          >
            {busy ? 'Removing…' : 'Confirm disable'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMode('idle')
              setCode('')
              setError(null)
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-md border p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className={enabled ? 'h-5 w-5 text-primary' : 'h-5 w-5 text-muted-foreground'} />
          <span className="text-sm font-medium">
            {enabled ? 'Two-factor authentication is on' : 'Two-factor authentication is off'}
          </span>
          {enabled && <Badge>On</Badge>}
        </div>
        {enabled ? (
          <Button size="sm" variant="outline" onClick={() => { setMode('disable'); setCode(''); setError(null) }}>
            Disable
          </Button>
        ) : (
          <Button size="sm" onClick={startEnroll} disabled={busy}>
            {busy ? 'Starting…' : 'Enable'}
          </Button>
        )}
      </div>
      {enabled && (
        <div className="flex items-center justify-between gap-4 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">Backup codes</p>
            <p className="text-xs text-muted-foreground">
              {remaining === null
                ? 'One-time codes for if you lose your authenticator.'
                : `${remaining} unused code${remaining === 1 ? '' : 's'} remaining.`}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>
            {busy ? 'Generating…' : 'Regenerate'}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
