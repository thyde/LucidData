'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  declareIssuerKeyCompromisedAction,
  getKeyLifecycleStatusAction,
  listIssuerPublicKeysAction,
  rotateIssuerKeyAction,
} from '@/lib/actions/issuer-key.actions'
import { formatDate } from '@/lib/utils/date-formatter'
import type { KeyLifecycleStatus } from '@/lib/services/issuer-key.service'

type PublicKeyRow = Awaited<ReturnType<typeof listIssuerPublicKeysAction>>[number]

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  retired: 'Retired',
  compromised: 'Compromised',
  revoked: 'Revoked',
}

/**
 * LD-406: rotate signing keys and contain a compromise.
 *
 * A retired key keeps verifying the credentials it signed. A compromised key
 * fails everything signed after the moment it leaked, and every affected holder
 * is notified.
 */
export function IssuerKeyManager({
  orgId,
  initialStatus,
  initialKeys,
}: {
  orgId: string
  initialStatus: KeyLifecycleStatus
  initialKeys: PublicKeyRow[]
}) {
  const [status, setStatus] = useState(initialStatus)
  const [keys, setKeys] = useState(initialKeys)
  const [compromiseKeyId, setCompromiseKeyId] = useState<string | null>(null)
  const [compromisedAt, setCompromisedAt] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      const [nextStatus, nextKeys] = await Promise.all([
        getKeyLifecycleStatusAction(orgId),
        listIssuerPublicKeysAction(orgId),
      ])
      setStatus(nextStatus)
      setKeys(nextKeys)
    })
  }

  function rotate() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const { keyId } = await rotateIssuerKeyAction(orgId, { reason: 'scheduled' })
        setMessage(`New signing key ${keyId} is now active. Credentials signed by the old key still verify.`)
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The key could not be rotated.')
      }
    })
  }

  function declareCompromise(event: React.FormEvent) {
    event.preventDefault()
    if (!compromiseKeyId) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const { affectedCredentials } = await declareIssuerKeyCompromisedAction(orgId, {
          keyId: compromiseKeyId,
          compromisedAt: new Date(compromisedAt).toISOString(),
        })
        setMessage(
          `Key marked compromised. ${affectedCredentials} credential(s) signed after that moment no longer verify, and their holders were notified.`
        )
        setCompromiseKeyId(null)
        setCompromisedAt('')
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The key could not be marked compromised.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-5 space-y-3">
        <div>
          <h3 className="font-medium">Signing keys</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Every credential you issue is verified against the key that signed it. Rotating
            regularly keeps the window a stolen key is useful in short.
          </p>
        </div>

        <div className="text-sm">
          {status.activeKeyId ? (
            <p>
              Active key <span className="font-mono">{status.activeKeyId}</span>
              {status.activeSince && ` since ${formatDate(status.activeSince)}`}
              {status.ageDays !== null && ` (${status.ageDays} days old)`}
            </p>
          ) : (
            <p>No signing key yet. One is created the first time you issue a credential.</p>
          )}
        </div>

        {status.rotationDue && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            This key is over a year old. Rotate it. Credentials signed with it keep working.
          </div>
        )}

        <Button variant="outline" size="sm" disabled={pending} onClick={rotate}>
          Rotate signing key
        </Button>

        {message && <p className="text-sm">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {keys.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {keys.map((key) => (
            <li
              key={key.keyId}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm truncate">{key.keyId}</p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[key.status] ?? key.status} · from {formatDate(key.validFrom)}
                  {key.validUntil ? ` to ${formatDate(key.validUntil)}` : ''}
                </p>
              </div>
              {key.status !== 'compromised' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setCompromiseKeyId(key.keyId)
                    setCompromisedAt(new Date().toISOString().slice(0, 16))
                  }}
                >
                  Report compromised
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {compromiseKeyId && (
        <form onSubmit={declareCompromise} className="rounded-lg border border-destructive/40 p-5 space-y-3">
          <div>
            <h3 className="font-medium text-destructive">Report a compromised key</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Everything signed at or after the moment you give stops verifying. Credentials
              signed before it stay valid but are flagged for re-checking. Holders are notified.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="compromised-at">Believed compromised from</Label>
            <Input
              id="compromised-at"
              type="datetime-local"
              required
              value={compromisedAt}
              onChange={(e) => setCompromisedAt(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={pending}>
              Mark compromised
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCompromiseKeyId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
