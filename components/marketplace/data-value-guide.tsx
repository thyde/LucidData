import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCents } from '@/components/dashboard/chart-theme'
import {
  DATA_TYPE_PRICING,
  DATA_BUNDLES,
  SENSITIVITY_LABEL,
  monthlyValueCents,
  bundleMonthlyValueCents,
  estimatedMonthlyValueCents,
} from '@/lib/constants/data-pricing'

/**
 * Seller-facing reference: what each data type is worth per month and what the
 * common bundles are worth. If the person already holds data, it also shows an
 * estimate based on the categories in their vault.
 */
export function DataValueGuide({ yourCategories }: { yourCategories: string[] }) {
  const types = Object.values(DATA_TYPE_PRICING).sort(
    (a, b) => b.annualValueCents - a.annualValueCents
  )
  const yourEstimate = estimatedMonthlyValueCents(yourCategories)

  return (
    <Card>
      <CardHeader>
        <CardTitle>What your data is worth</CardTitle>
        <CardDescription>
          Median market value by data type. Buyers pay a per-record price plus an access fee, and
          bundles sell a whole profile together.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {yourCategories.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Based on the categories in your vault</p>
            <p className="text-2xl font-semibold">
              {formatCents(yourEstimate)}{' '}
              <span className="text-sm font-normal text-muted-foreground">/ month</span>
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">By data type</p>
          <ul className="divide-y">
            {types.map((t) => (
              <li key={t.category} className="flex items-center justify-between py-2 text-sm">
                <span>{t.label}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {SENSITIVITY_LABEL[t.sensitivity]}
                  </span>
                  <span className="font-medium">{formatCents(monthlyValueCents(t.category))} / mo</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Bundles</p>
          <ul className="divide-y">
            {DATA_BUNDLES.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{b.label}</span>
                  <span className="block text-xs text-muted-foreground">{b.description}</span>
                </span>
                <span className="shrink-0 font-medium">{formatCents(bundleMonthlyValueCents(b))} / mo</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
