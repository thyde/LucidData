'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { purchasePoolAction } from '@/lib/actions/data-order.actions'
import { closePoolAction } from '@/lib/actions/marketplace.actions'
import { categoryLabel, formatCents } from '@/components/dashboard/chart-theme'
import { PoolEvaluationDialog } from '@/components/buyer/pool-evaluation-dialog'
import type { DataPool } from '@/types/database.types'
import { unwrap } from '@/lib/actions/unwrap'

const PRICING_LABEL = {
  snapshot: 'One-time snapshot',
  subscription: 'Subscription',
  filtered: 'Filtered bundle',
} as const

function pricingLabel(pricingModel: string): string {
  switch (pricingModel) {
    case 'snapshot':
    case 'subscription':
    case 'filtered':
      return PRICING_LABEL[pricingModel]
    default:
      return pricingModel
  }
}

export function DatasetBrowser({ orgId, pools }: { orgId: string; pools: DataPool[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No data pools yet. Create one to start collecting consented data.
      </p>
    )
  }

  function purchase(pool: DataPool) {
    setPendingId(pool.id)
    startTransition(async () => {
      try {
        const result = await unwrap(purchasePoolAction(orgId, { pool_id: pool.id, order_type: 'snapshot' }))
        if (result.kind === 'checkout') {
          window.location.href = result.url
          return
        }
        toast({
          title: 'Purchase complete',
          description: `${result.recordCount} record(s) · ${formatCents(result.totalCents)}. Download it from Orders.`,
        })
        router.refresh()
      } catch (err) {
        toast({
          title: 'Purchase failed',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingId(null)
      }
    })
  }

  function close(pool: DataPool) {
    setPendingId(pool.id)
    startTransition(async () => {
      try {
        await unwrap(closePoolAction(orgId, pool.id))
        toast({ title: 'Pool closed' })
        router.refresh()
      } catch {
        toast({ title: 'Could not close pool', variant: 'destructive' })
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {pools.map((pool) => {
        const busy = isPending && pendingId === pool.id
        return (
          <Card key={pool.id} className="flex h-full flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{categoryLabel(pool.category)}</Badge>
                <Badge variant={pool.status === 'open' ? 'default' : 'outline'}>{pool.status}</Badge>
              </div>
              <CardTitle className="text-lg">{pool.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {pool.description && (
                <p className="text-sm text-muted-foreground">{pool.description}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {pricingLabel(pool.pricing_model)} · {formatCents(pool.price_per_record_cents)} /
                record · base {formatCents(pool.price_cents)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {/* LD-503: see what a purchase would actually deliver first. */}
                <PoolEvaluationDialog orgId={orgId} poolId={pool.id} poolName={pool.name} />
                <Button size="sm" disabled={busy} onClick={() => purchase(pool)}>
                  Buy snapshot
                </Button>
                {pool.status === 'open' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => close(pool)}>
                    Close
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
