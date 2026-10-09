'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useEncryption } from '@/lib/context/encryption-context'
import { useVaultList } from '@/lib/hooks/useVault'
import { useTimelineVisit } from '@/lib/hooks/use-timeline-visit'
import { addDays, buildTimeline, dayOf, type MetricSeries, type TimelineEntry } from '@luciddata/core/health/timeline'
import { Button } from '@/components/ui/button'
import { PasskeyUnlockButton } from '@/components/auth/passkey-unlock-button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MetricCard } from './metric-card'
import { ShareSummaryDialog } from './share-summary-dialog'
import { HealthShareList } from './health-share-list'
import { formatDay } from './format'
import type { DecryptedVaultData } from '@/types'

const RANGES = [
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: '365', label: '1 year', days: 365 },
  { id: 'all', label: 'All', days: null },
] as const

type RangeId = (typeof RANGES)[number]['id']

/** Decrypted entries as the timeline reads them. Anything it does not chart is ignored there. */
export function timelineEntries(entries: readonly DecryptedVaultData[] | undefined): TimelineEntry[] {
  return (entries ?? []).flatMap((entry) =>
    entry.data && typeof entry.data === 'object'
      ? [
          {
            schemaType: entry.schema_type,
            data: entry.data,
            provider: entry.source_provider ?? null,
            capturedAt: entry.source_captured_at ?? null,
          },
        ]
      : []
  )
}

/** Today's date where the reader is. */
export function localToday(): string {
  return dayOf(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

/** The timeline over everything recorded up to today, worked out once per change to the vault. */
export function useHealthSeries(): {
  series: MetricSeries[]
  today: string
  isLoading: boolean
  error: Error | null
  refetch: () => unknown
} {
  const { data, isLoading, error, refetch } = useVaultList()
  const today = localToday()
  const series = useMemo(() => buildTimeline(timelineEntries(data), { to: today }), [data, today])
  return { series, today, isLoading, error, refetch }
}

/** A series cut to the days from `from` on, with the latest value inside the cut. */
function within(series: MetricSeries, from: string): MetricSeries {
  const days = series.days.filter((day) => day.date >= from)
  return { ...series, days, latest: days.at(-1) ?? null }
}

export function VaultLockedNotice({ returnTo }: { returnTo: string }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Your vault is locked</h1>
      <p className="max-w-sm text-muted-foreground">
        Your health figures are worked out on this device from your encrypted records. Sign in again
        to unlock them.
      </p>
      <Button asChild>
        <Link href={`/login?redirectedFrom=${encodeURIComponent(returnTo)}`}>Sign in</Link>
      </Button>
      <PasskeyUnlockButton />
    </div>
  )
}

export function HealthTimeline() {
  const { isLocked } = useEncryption()
  const { series, today, isLoading, error, refetch } = useHealthSeries()
  const [rangeId, setRangeId] = useState<RangeId>('30')
  useTimelineVisit(!isLocked)

  const recorded = series.filter((item) => item.days.length > 0)
  const earliest = recorded.reduce<string | null>((first, item) => (!first || item.days[0].date < first ? item.days[0].date : first), null)
  const latest = recorded.reduce<string | null>((last, item) => (!last || item.days.at(-1)!.date > last ? item.days.at(-1)!.date : last), null)
  const range = RANGES.find((option) => option.id === rangeId) ?? RANGES[0]
  const from = range.days ? addDays(today, -(range.days - 1)) : (earliest ?? today)
  const shown = recorded.map((item) => within(item, from)).filter((item) => item.days.length > 0)

  if (isLocked) return <VaultLockedNotice returnTo="/health" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Health</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Daily figures from the health records in your vault, worked out on this device. Nothing
            leaves it unless you share a summary, which is encrypted here first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Date range" className="flex flex-wrap gap-1">
            {RANGES.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={rangeId === option.id ? 'default' : 'outline'}
                aria-pressed={rangeId === option.id}
                onClick={() => setRangeId(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {recorded.length > 0 && <ShareSummaryDialog series={recorded} today={today} />}
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2" data-testid="health-loading">
          {[1, 2, 3, 4].map((index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-1/3 rounded bg-muted" />
                <div className="h-8 w-1/2 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-40 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="py-12 text-center">
          <p className="mb-4 text-destructive">Your vault could not be loaded.</p>
          <Button onClick={() => refetch()}>Try again</Button>
        </div>
      )}

      {!isLoading && !error && latest === null && (
        <div className="rounded-lg border p-8 text-center" data-testid="health-empty">
          <h2 className="text-lg font-semibold">No health records yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Import an export from Apple Health, Strava, or Garmin on the vault page, and its daily
            figures appear here, one chart for each.
          </p>
          <Button asChild className="mt-4">
            <Link href="/vault">Go to your vault</Link>
          </Button>
        </div>
      )}

      {!isLoading && !error && latest !== null && shown.length === 0 && (
        <div className="rounded-lg border p-8 text-center" data-testid="health-empty-range">
          <h2 className="text-lg font-semibold">Nothing recorded in this range</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your most recent health record is from {formatDay(latest, true)}. Choose All to see it.
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((item) => (
            <MetricCard key={item.metric.id} series={item} from={from} to={today} />
          ))}
        </div>
      )}

      <HealthShareList />
    </div>
  )
}
