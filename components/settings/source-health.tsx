'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  deriveSourceHealth,
  formatCoverage,
  formatFreshness,
  type SourceHealth as Health,
} from '@/lib/utils/freshness'
import type { ConnectedSource } from '@/lib/services/connector.service'

/**
 * LD-202: what a connected source is actually doing.
 *
 * A connector that quietly stopped is the worst outcome, because the vault
 * still looks populated while the numbers go stale. So this shows four states
 * rather than two, and a source that has not synced in two days is called out
 * even though nothing errored.
 */

const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Syncing',
  stale: 'Out of date',
  error: 'Needs attention',
  pending: 'Waiting for first sync',
}

const HEALTH_VARIANT: Record<Health, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  healthy: 'default',
  stale: 'outline',
  error: 'destructive',
  pending: 'secondary',
}

interface SourceHealthProps {
  source: ConnectedSource
  /**
   * Supplied by the caller rather than read here, because reading the clock
   * during render makes the component impure and gives a different answer on
   * the server than in the browser.
   */
  now: number
  onDisconnect: (deleteImported: boolean) => void
  disabled?: boolean
}

export function SourceHealth({
  source,
  now,
  onDisconnect,
  disabled = false,
}: SourceHealthProps) {
  const health = deriveSourceHealth(source.status, source.lastSyncedAt, now)
  const coverage = formatCoverage(source.firstCapturedAt, source.lastCapturedAt)
  const broken = health === 'error' || health === 'stale'

  return (
    <li
      data-testid={`source-${source.provider}`}
      data-health={health}
      className={
        broken
          ? 'space-y-2 border-l-4 border-l-destructive px-4 py-3'
          : 'space-y-2 border-l-4 border-l-transparent px-4 py-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{source.label}</p>
          <p className="text-xs text-muted-foreground">
            Last synced {formatFreshness(source.lastSyncedAt, now)}
          </p>
        </div>
        <Badge variant={HEALTH_VARIANT[health]}>{HEALTH_LABEL[health]}</Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="font-medium">Records imported</dt>
          <dd>{source.recordCount}</dd>
        </div>
        {coverage && (
          <div className="flex gap-1">
            <dt className="font-medium">Covers</dt>
            <dd>{coverage}</dd>
          </div>
        )}
      </dl>

      {health === 'stale' && !source.lastError && (
        <p className="text-sm text-muted-foreground">
          This source has not sent anything for a while. Reconnect it if you expected newer
          records.
        </p>
      )}

      {source.lastError && (
        <p role="alert" className="text-sm text-destructive">
          {source.lastError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {broken && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/connectors/${source.provider}/authorize`}>Reconnect</a>
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onDisconnect(false)}
        >
          Disconnect
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onDisconnect(true)}
        >
          Disconnect and delete imported entries
        </Button>
      </div>
    </li>
  )
}
