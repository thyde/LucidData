'use client'

import Link from 'next/link'
import { useEncryption } from '@/lib/context/encryption-context'
import { Button } from '@/components/ui/button'
import { PasskeyUnlockButton } from '@/components/auth/passkey-unlock-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { sourceLabel, type MetricId } from '@luciddata/core/health/timeline'
import { useHealthSeries } from './health-timeline'
import { formatDay, formatValue } from './format'

/** The figures the dashboard leads with, when the vault has them. */
const HEADLINE: readonly MetricId[] = ['steps', 'sleep_hours', 'resting_heart_rate', 'workout_minutes']

export function HealthSummaryCard() {
  const { isLocked } = useEncryption()
  const { series, isLoading, error } = useHealthSeries()

  const recorded = series.filter((item) => item.latest)
  const headline = [
    ...recorded.filter((item) => HEADLINE.includes(item.metric.id)),
    ...recorded.filter((item) => !HEADLINE.includes(item.metric.id)),
  ].slice(0, 4)

  return (
    <Card data-testid="health-summary">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle role="heading" aria-level={2}>
            Health
          </CardTitle>
          <CardDescription>
            {isLocked
              ? 'Your vault is locked. Sign in again to see your latest figures.'
              : 'Your latest figures, worked out on this device'}
          </CardDescription>
        </div>
        {!isLocked && headline.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href="/health">Open your timeline</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLocked && (
          <div className="flex flex-wrap items-start gap-2">
            <Button asChild size="sm">
              <Link href="/login?redirectedFrom=%2Fhealth">Sign in</Link>
            </Button>
            <PasskeyUnlockButton />
          </div>
        )}

        {!isLocked && isLoading && (
          <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="health-summary-loading">
            {[1, 2, 3, 4].map((index) => (
              <div key={index} className="h-16 rounded bg-muted" />
            ))}
          </div>
        )}

        {!isLocked && error && (
          <p className="text-sm text-destructive">Your health figures could not be loaded.</p>
        )}

        {!isLocked && !isLoading && !error && headline.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Import an export from Apple Health, Strava, or Garmin, and your steps, sleep, heart rate,
              and workouts appear here.
            </p>
            <Button asChild size="sm">
              <Link href="/vault">Import an export</Link>
            </Button>
          </div>
        )}

        {!isLocked && headline.length > 0 && (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {headline.map((item) => (
              <div key={item.metric.id} className="rounded-md border p-3">
                <dt className="text-sm text-muted-foreground">{item.metric.label}</dt>
                <dd className="text-xl font-semibold">{formatValue(item.metric, item.latest!.value)}</dd>
                <dd className="text-xs text-muted-foreground">
                  {formatDay(item.latest!.date, true)}, from {sourceLabel(item.latest!.source)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
