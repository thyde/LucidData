'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Repeat, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContributeDialog } from '@/components/marketplace/contribute-dialog'
import { categoryLabel, formatCents } from '@/components/dashboard/chart-theme'
import type { DataPool } from '@/types/database.types'

const PRICING_ICON = {
  snapshot: Package,
  subscription: Repeat,
  filtered: Filter,
} as const

const PRICING_LABEL = {
  snapshot: 'One-time snapshot',
  subscription: 'Subscription',
  filtered: 'Filtered bundle',
} as const

export function PoolList({ pools }: { pools: DataPool[] }) {
  const router = useRouter()
  const [activePool, setActivePool] = useState<DataPool | null>(null)

  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open data pools right now. Check back soon.
      </p>
    )
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {pools.map((pool) => {
          const Icon = PRICING_ICON[pool.pricing_model]
          return (
            <Card key={pool.id} className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{categoryLabel(pool.category)}</Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {PRICING_LABEL[pool.pricing_model]}
                  </span>
                </div>
                <CardTitle className="text-lg">{pool.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                {pool.description && (
                  <p className="text-sm text-muted-foreground">{pool.description}</p>
                )}
                {pool.requested_fields.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {pool.requested_fields.slice(0, 6).map((f) => (
                      <Badge key={f} variant="outline" className="text-xs">
                        {f}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">
                    {formatCents(pool.price_per_record_cents)} / record
                  </span>
                  <Button size="sm" onClick={() => setActivePool(pool)}>
                    Contribute
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {activePool && (
        <ContributeDialog
          pool={activePool}
          open={!!activePool}
          onOpenChange={(v) => !v && setActivePool(null)}
          onContributed={() => router.refresh()}
        />
      )}
    </>
  )
}
