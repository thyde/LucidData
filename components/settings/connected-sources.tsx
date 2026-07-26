'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import { usePendingIngest } from '@/lib/hooks/usePendingIngest'
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
  const drain = usePendingIngest()

  useEffect(() => {
    let active = true
    listConnectorsAction()
      .then((result) => {
        if (!active) return
        setAvailable(result.available)
        setConnected(result.connected)
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
        await disconnectSourceAction({ sourceId: source.id, deleteImported })
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
            <li key={source.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{source.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.lastSyncedAt
                      ? `Last synced ${new Date(source.lastSyncedAt).toLocaleString()}`
                      : 'Not synced yet'}
                  </p>
                </div>
                <Badge variant={source.status === 'connected' ? 'default' : 'destructive'}>
                  {source.status}
                </Badge>
              </div>

              {source.lastError && (
                <p className="text-sm text-destructive">{source.lastError}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {source.status === 'error' && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/api/connectors/${source.provider}/authorize`}>Reconnect</a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => disconnect(source, false)}
                >
                  Disconnect
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => disconnect(source, true)}
                >
                  Disconnect and delete imported entries
                </Button>
              </div>
            </li>
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
