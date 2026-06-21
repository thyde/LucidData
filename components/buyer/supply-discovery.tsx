import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCents } from '@/components/dashboard/chart-theme'
import type { MarketSupplyRow } from '@/lib/services/marketplace.service'

const SENSITIVITY_VARIANT: Record<string, 'secondary' | 'outline'> = {
  high: 'secondary',
  standard: 'outline',
  low: 'outline',
}

// Anonymized, aggregate view of opted-in data supply by category, with suggested
// pricing. Helps buyers see where supply exists before creating a pool or offer.
export function SupplyDiscovery({ rows }: { rows: MarketSupplyRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No opted-in supply yet. As individuals opt vault fields into selling, categories and seller
        counts appear here to guide your pools and offers.
      </p>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.category}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <span className="font-medium">{row.label}</span>
              <Badge variant={SENSITIVITY_VARIANT[row.sensitivity] ?? 'outline'}>
                {row.sensitivity} sensitivity
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold">{row.sellers}</div>
                <div className="text-[11px] text-muted-foreground">sellers</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{row.fields}</div>
                <div className="text-[11px] text-muted-foreground">fields</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{row.activeContributors}</div>
                <div className="text-[11px] text-muted-foreground">contributing</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Suggested {formatCents(row.suggestedAccessFeeCents)} access +{' '}
              {formatCents(row.suggestedPerRecordCents)}/record
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
