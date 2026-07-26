'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Repeat, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContributeDialog } from '@/components/marketplace/contribute-dialog'
import { categoryLabel, formatCents } from '@/components/dashboard/chart-theme'
import {
  MARKETPLACE_PURPOSE_LABELS,
  isMarketplaceCategoryAllowed,
} from '@/lib/validations/marketplace'
import type { OpenDataPool } from '@/lib/services/marketplace.service'
import type { SalePreferences } from '@/types/database.types'

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

function pricingDisplay(pricingModel: string) {
  switch (pricingModel) {
    case 'snapshot':
      return { Icon: PRICING_ICON.snapshot, label: PRICING_LABEL.snapshot }
    case 'subscription':
      return { Icon: PRICING_ICON.subscription, label: PRICING_LABEL.subscription }
    case 'filtered':
      return { Icon: PRICING_ICON.filtered, label: PRICING_LABEL.filtered }
    default:
      return { Icon: Package, label: pricingModel }
  }
}

function incompatibility(pool: OpenDataPool, preferences: SalePreferences | null): string | null {
  if (!isMarketplaceCategoryAllowed(pool.category as Parameters<typeof isMarketplaceCategoryAllowed>[0])) {
    return 'This category is not available for marketplace sale.'
  }
  if (preferences && pool.price_per_record_cents < preferences.min_price_cents) {
    return `Below your ${formatCents(preferences.min_price_cents)} minimum.`
  }
  if (preferences?.blocked_buyer_orgs.includes(pool.buyer_org_id)) {
    return 'You blocked this buyer.'
  }
  if (
    preferences &&
    preferences.allowed_purposes.length > 0 &&
    !preferences.allowed_purposes.includes(pool.purpose)
  ) {
    return 'This purpose is not in your allowed purposes.'
  }
  return null
}

export function PoolList({
  pools,
  preferences,
}: {
  pools: OpenDataPool[]
  preferences: SalePreferences | null
}) {
  const router = useRouter()
  const [activePool, setActivePool] = useState<OpenDataPool | null>(null)

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
          const { Icon, label } = pricingDisplay(pool.pricing_model)
          const blockedReason = incompatibility(pool, preferences)
          return (
            <Card key={pool.id} className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{categoryLabel(pool.category)}</Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                </div>
                <CardTitle className="text-lg">{pool.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {pool.buyer_name}{pool.buyer_verified ? ' · Verified buyer' : ' · Unverified buyer'}
                </p>
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
                  <div className="text-sm">
                    <p className="font-medium text-primary">
                      {formatCents(pool.price_per_record_cents)} / record
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {MARKETPLACE_PURPOSE_LABELS[pool.purpose as keyof typeof MARKETPLACE_PURPOSE_LABELS]}
                      {' · '}{pool.retention_days}-day retention
                      {' · '}minimum {pool.minimum_contributors} contributors
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={Boolean(blockedReason)}
                    onClick={() => setActivePool(pool)}
                  >
                    Contribute
                  </Button>
                </div>
                {blockedReason && (
                  <p className="mt-2 text-xs text-destructive">{blockedReason}</p>
                )}
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
