'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { StepUpDialog } from '@/components/auth/step-up-dialog'
import {
  listSessionsAction,
  revokeSessionAction,
} from '@/lib/actions/session-security.actions'
import {
  IDLE_LOCK_OPTIONS,
  useEncryption,
} from '@/lib/context/encryption-context'
import { formatDateTime } from '@/lib/utils/date-formatter'
import type { SessionSummary } from '@/lib/services/session-security.service'
import { unwrap } from '@/lib/actions/unwrap'

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS device'
  if (/android/i.test(userAgent)) return 'Android device'
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac'
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/linux/i.test(userAgent)) return 'Linux'
  return 'Unknown device'
}

/**
 * LD-106: control how long an unlocked vault stays open, and end sessions you do
 * not recognise. Ending a session requires re-entering your password, so a
 * stolen warm session cannot lock the real owner out.
 */
export function SessionSecuritySection({ initial }: { initial: SessionSummary[] }) {
  const { idleLockMinutes, setIdleLockMinutes, lock, isLocked } = useEncryption()
  const [sessions, setSessions] = useState(initial)
  const [target, setTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      try {
        setSessions(await unwrap(listSessionsAction()))
      } catch {
        setError('Sessions could not be refreshed.')
      }
    })
  }

  async function confirmRevoke(token: string) {
    if (!target) return
    setError(null)
    try {
      await unwrap(revokeSessionAction({ sessionId: target, stepUpToken: token }))
      setTarget(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That session could not be ended.')
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Session security</h2>
      <p className="text-sm text-muted-foreground">
        Your vault key is held only in this tab. Locking clears it, so it has to be derived
        again from your password.
      </p>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <label htmlFor="idle-lock" className="text-sm font-medium">
              Lock the vault after
            </label>
            <p className="text-xs text-muted-foreground">
              Inactivity clears the key from memory on this device.
            </p>
          </div>
          <select
            id="idle-lock"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={idleLockMinutes}
            onChange={(e) => setIdleLockMinutes(Number(e.target.value))}
          >
            {IDLE_LOCK_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
            <option value={0}>Never</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={lock} disabled={isLocked}>
          {isLocked ? 'Vault is locked' : 'Lock the vault now'}
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Signed-in sessions</h3>
        <ul className="divide-y rounded-lg border">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {describeDevice(session.userAgent)}
                  {session.current && ' · this device'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.ip ? `${session.ip} · ` : ''}
                  {session.lastSeenAt
                    ? `last seen ${formatDateTime(session.lastSeenAt)}`
                    : `started ${formatDateTime(session.createdAt)}`}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setTarget(session.id)}
                >
                  End session
                </Button>
              )}
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No sessions to show.</li>
          )}
        </ul>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <StepUpDialog
        action="revoke_session"
        title="Confirm your password"
        description="Ending another session is a security action, so we ask for your password again."
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        onConfirmed={confirmRevoke}
      />
    </section>
  )
}
