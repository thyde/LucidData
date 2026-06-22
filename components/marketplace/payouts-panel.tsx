'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { startPayoutOnboardingAction } from '@/lib/actions/payout.actions'
import { formatCents } from '@/components/dashboard/chart-theme'
import type { PayoutOverview } from '@/lib/services/payout.service'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function PayoutsPanel({ overview }: { overview: PayoutOverview }) {
  const params = useSearchParams()
  const flag = params.get('payouts')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onboard() {
    setError(null)
    setPending(true)
    try {
      const { url } = await startPayoutOnboardingAction()
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payout setup.')
      setPending(false)
    }
  }

  const status = overview.payoutsEnabled
    ? 'enabled'
    : overview.connected
      ? 'incomplete'
      : 'none'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Payouts</CardTitle>
            <CardDescription>
              Get paid automatically when a buyer purchases a pool you contributed to.
            </CardDescription>
          </div>
          {status === 'enabled' && <Badge>Active</Badge>}
          {status === 'incomplete' && <Badge variant="secondary">Setup incomplete</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {flag === 'ready' && status === 'enabled' && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            Payouts are set up. Any pending earnings are on their way to your bank.
          </p>
        )}
        {flag === 'refresh' && status !== 'enabled' && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Payout setup was not finished. Continue to start receiving earnings.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Paid out</p>
            <p className="text-lg font-medium">{formatCents(overview.paidCents)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pending</p>
            <p className="text-lg font-medium">{formatCents(overview.pendingCents)}</p>
          </div>
        </div>

        {status !== 'enabled' && (
          <Button size="sm" disabled={pending} onClick={onboard}>
            {pending
              ? 'Redirecting'
              : status === 'incomplete'
                ? 'Finish payout setup'
                : 'Set up payouts'}
          </Button>
        )}

        {overview.payouts.length > 0 && (
          <ul className="divide-y text-sm">
            {overview.payouts.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">{formatDate(p.created_at)}</span>
                <span className="font-medium">{formatCents(p.amount_cents)}</span>
                <Badge
                  variant={
                    p.status === 'paid'
                      ? 'default'
                      : p.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {p.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
