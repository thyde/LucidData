'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { usePendingIngest } from '@/lib/hooks/usePendingIngest'
import { SourceHealth } from '@/components/settings/source-health'
import { unwrap } from '@/lib/actions/unwrap'
import {
  disconnectSourceAction,
  listConnectorsAction,
} from '@/lib/actions/connector.actions'
import type { ConnectedSource } from '@/lib/services/connector.service'

/**
 * LD-201: connect a provider so the vault fills without manual entry.
 *
 * The copy here has one job beyond the buttons: say plainly that the sync runs
 * without the person present and still cannot read what it writes. That is the
 * whole reason this is different from every other connector catalog, and it is
 * invisible unless we say it.
 */
export function ConnectedSources() {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [available, setAvailable] = useState<{ id: string; label: string }[]>([])
  const [connected, setConnected] = useState<ConnectedSource[]>([])
  const [loaded, setLoaded] = useState(false)
  // Read once when the list loads, not during render. Freshness is relative to
  // a moment, and that moment has to be the same for every row.
  const [now, setNow] = useState(0)
  const drain = usePendingIngest()

  useEffect(() => {
    let active = true
    unwrap(listConnectorsAction())
      .then((result) => {
        if (!active) return
        setAvailable(result.available)
        setConnected(result.connected)
        setNow(Date.now())
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => {
      active = false
    }
  }, [drain.imported])

  function disconnect(source: ConnectedSource, deleteImported: boolean) {
    startTransition(async () => {
      try {
        await unwrap(disconnectSourceAction({ sourceId: source.id, deleteImported }))
        toast({ title: `Disconnected ${source.label}` })
        setConnected((current) => current.filter((entry) => entry.id !== source.id))
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not disconnect',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  if (!loaded) return null

  const connectedProviders = new Set(connected.map((source) => source.provider))
  const connectable = available.filter((entry) => !connectedProviders.has(entry.id))

  return (
    <section className="space-y-4 rounded-md border p-4">
      <div>
        <h2 className="text-lg font-medium">Connected sources</h2>
        <p className="text-sm text-muted-foreground">
          Connect an account and your vault fills without typing. The sync runs while you are
          away, so it only gets a key that locks records, never one that opens them. New
          records stay sealed until you next unlock, and are decrypted in your browser.
        </p>
      </div>

      {drain.status === 'draining' && (
        <p className="text-sm text-muted-foreground">Importing new records...</p>
      )}
      {drain.status === 'done' && drain.imported > 0 && (
        <p className="text-sm text-muted-foreground">
          Imported {drain.imported} new record{drain.imported === 1 ? '' : 's'}.
        </p>
      )}

      {connected.length > 0 && (
        <ul className="divide-y rounded-md border">
          {connected.map((source) => (
            <SourceHealth
              key={source.id}
              source={source}
              now={now}
              disabled={isPending}
              onDisconnect={(deleteImported) => disconnect(source, deleteImported)}
            />
          ))}
        </ul>
      )}

      {connectable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {connectable.map((entry) => (
            <Button key={entry.id} size="sm" variant="outline" asChild>
              <a href={`/api/connectors/${entry.id}/authorize`}>Connect {entry.label}</a>
            </Button>
          ))}
        </div>
      ) : (
        available.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No providers are configured in this environment yet.
          </p>
        )
      )}
    </section>
  )
}
