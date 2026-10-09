'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ANYONE_WITH_THE_LINK } from '@luciddata/core/health/share'
import { METRICS } from '@luciddata/core/health/timeline'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useHealthShares, useRevokeHealthShare } from '@/lib/hooks/use-health-shares'
import type { HealthShareSummary } from '@/lib/services/health-share.service'
import { formatDay } from './format'

type ShareStatus = 'open' | 'expired' | 'revoked'

export function shareStatus(share: Pick<HealthShareSummary, 'revoked_at' | 'expires_at'>, now: number): ShareStatus {
  if (share.revoked_at) return 'revoked'
  return Date.parse(share.expires_at) <= now ? 'expired' : 'open'
}

function figures(metrics: string[]): string {
  const labels = metrics.map((id) => METRICS.find((metric) => metric.id === id)?.label ?? id)
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

const when = (iso: string) => format(new Date(iso), 'MMM d, yyyy')

/** Where a share stands and who has opened it, in one line. */
export function shareStatusText(share: HealthShareSummary, now: number): string {
  const status = shareStatus(share, now)
  const state =
    status === 'revoked'
      ? `Revoked on ${when(share.revoked_at!)}`
      : status === 'expired'
        ? `Expired on ${when(share.expires_at)}`
        : `Open until ${when(share.expires_at)}`
  const views =
    share.view_count === 0
      ? 'not opened'
      : `opened ${share.view_count === 1 ? 'once' : `${share.view_count} times`}, most recently on ${when(share.last_viewed_at!)}`
  return `${state}, ${views}.`
}

export function HealthShareList() {
  const { data: shares, error } = useHealthShares()
  const revoke = useRevokeHealthShare()
  const [now] = useState(() => Date.now())
  const [confirming, setConfirming] = useState<HealthShareSummary | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  if (error) {
    return <p className="text-sm text-destructive">Your shared summaries could not be loaded.</p>
  }
  if (!shares || shares.length === 0) return null

  async function confirmRevoke() {
    if (!confirming) return
    setFailure(null)
    try {
      await revoke.mutateAsync(confirming.id)
    } catch (caught) {
      setFailure(
        caught instanceof Error && caught.name === 'UserFacingError' ? caught.message : 'The link was not revoked. Try again.'
      )
    } finally {
      setConfirming(null)
    }
  }

  return (
    <section aria-labelledby="shared-summaries" className="space-y-3">
      <div>
        <h2 id="shared-summaries" className="text-lg font-semibold">
          Shared summaries
        </h2>
        <p className="text-sm text-muted-foreground">
          Links you made from this page. Revoking one deletes the stored summary, so the link stops opening.
        </p>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <ul className="divide-y rounded-lg border bg-background">
        {shares.map((share) => (
          <li
            key={share.id}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="health-share"
          >
            <div className="space-y-0.5">
              <p className="font-medium">{share.label ?? ANYONE_WITH_THE_LINK}</p>
              <p className="text-sm">
                {figures(share.metrics)}, {formatDay(share.range_start, true)} to {formatDay(share.range_end, true)}
              </p>
              <p className="text-sm text-muted-foreground">{shareStatusText(share, now)}</p>
            </div>
            {shareStatus(share, now) === 'open' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(share)}
                aria-label={`Revoke the link for ${share.label ?? ANYONE_WITH_THE_LINK}`}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              LucidData deletes the stored summary and the link stops opening. Anyone who already opened it may have
              kept a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRevoke()} disabled={revoke.isPending}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
