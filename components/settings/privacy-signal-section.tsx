'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  allowSaleDespiteSignalAction,
  honourSignalAgainAction,
} from '@/lib/actions/privacy-signal.actions'
import type { UniversalOptOutState } from '@/lib/services/privacy-signal.service'

const SOURCE_LABEL: Record<string, string> = {
  gpc_header: 'the Sec-GPC request header',
  gpc_navigator: 'your browser privacy setting',
}

/**
 * LD-302: shows whether a universal opt-out signal was detected and exactly what
 * it does, plus a deliberate override in either direction.
 */
export function PrivacySignalSection({ initial }: { initial: UniversalOptOutState }) {
  const [state, setState] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const signalSeen = Boolean(state.detectedAt)

  function run(action: () => Promise<UniversalOptOutState>) {
    setError(null)
    startTransition(async () => {
      try {
        setState(await action())
      } catch {
        setError('That change could not be saved. Try again.')
      }
    })
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Universal opt-out signal</h2>
      <p className="text-sm text-muted-foreground">
        Some browsers send a Global Privacy Control signal that means do not sell or share my
        data. We honour it. It does not affect your vault, your consent grants, or credentials
        you hold.
      </p>

      <div className="rounded-lg border p-4">
        {!signalSeen && (
          <p className="text-sm">
            No signal detected from this browser. Your marketplace choices are whatever you set
            yourself.
          </p>
        )}

        {signalSeen && state.optedOut && (
          <>
            <p className="text-sm font-medium">Signal detected. Sale and sharing are off.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Detected from {SOURCE_LABEL[state.source ?? ''] ?? 'your browser'}. You cannot
              contribute to a data pool while this is on.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={pending}
              onClick={() => run(allowSaleDespiteSignalAction)}
            >
              Allow sale and sharing anyway
            </Button>
          </>
        )}

        {signalSeen && !state.optedOut && (
          <>
            <p className="text-sm font-medium">
              Signal detected, and you chose to allow sale and sharing.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              We recorded that choice, so it is never mistaken for the signal going away. You
              can contribute to data pools.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={pending}
              onClick={() => run(honourSignalAgainAction)}
            >
              Honour the signal again
            </Button>
          </>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </section>
  )
}
