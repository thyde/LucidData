'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  declineRecoverySetupAction,
  getRecoveryStatusAction,
} from '@/lib/actions/recovery.actions'

/**
 * LD-105: a new user cannot store data before deciding how they would get back
 * in. Storing first and deciding later is exactly the case that ends with an
 * unreadable vault and nobody able to help.
 *
 * This only appears for an account with no vault data, no recovery factor, and
 * no recorded decline. Existing vaults are never blocked.
 */
export function RecoverySetupGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState<boolean | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getRecoveryStatusAction()
      .then((status) => {
        if (!cancelled) setReady(status.vaultWriteAllowed)
      })
      .catch(() => {
        // If the check itself fails, do not lock the user out of their vault.
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (ready === null || ready) return <>{children}</>

  return (
    <div className="mx-auto max-w-xl space-y-6 py-16">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-1 h-6 w-6 text-amber-600" />
        <div>
          <h2 className="text-2xl font-semibold">Set up recovery first</h2>
          <p className="mt-2 text-muted-foreground">
            We hold no key to your vault. That is what stops us, or anyone who reaches our
            database, from reading it. It also means that if you forget your password and have
            no recovery factor, your data becomes permanently unreadable and nobody can restore
            it.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/settings">Set up recovery</Link>
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              try {
                await declineRecoverySetupAction()
                setReady(true)
              } catch {
                setError('That choice could not be saved. Try again.')
              }
            })
          }}
        >
          Continue without recovery
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Choosing to continue without recovery means accepting that a forgotten password makes
        your vault unreadable. You can add a recovery factor later in settings.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
