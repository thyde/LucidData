import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PLAN_CATALOG } from '@/lib/constants/billing-plans'
import { EXPORT_WINDOW_DAYS } from '@/lib/constants/marketplace-economics'
import { SALE_RESTRICTED_STATEMENT } from '@/lib/validations/marketplace'

interface Tier {
  name: string
  price: string
  cadence?: string
  audience: string
  features: string[]
  cta: { label: string; href: string }
  primary?: boolean
}

function dollars(cents: number | null): string {
  return `$${((cents ?? 0) / 100).toFixed(0)}`
}

export const TIERS: Tier[] = [
  {
    name: 'Individual',
    price: 'Free',
    audience: 'For your own health and personal records',
    features: [
      'Encrypted vault for health and personal records',
      'Apple Health import',
      'Consent you can revoke at any time',
      'Tamper-evident audit log',
    ],
    cta: { label: 'Create account', href: '/register' },
    primary: true,
  },
  {
    name: 'Business',
    price: 'Free',
    cadence: 'to start',
    audience: 'Issue and verify credentials',
    features: [
      'Issue verifiable credentials',
      'Verify shared credentials',
      'Domain verification and API keys',
      `${PLAN_CATALOG.free.description} on the free plan`,
      `Paid plans from ${dollars(PLAN_CATALOG.starter.amountCents)} a month raise the limit`,
    ],
    cta: { label: 'Register organization', href: '/org/register' },
  },
  {
    name: 'Data buyer',
    price: 'Pay per dataset',
    audience: 'Buy de-identified credential data',
    features: [
      'One-time snapshots with minimum cohort sizes',
      `${EXPORT_WINDOW_DAYS}-day download window`,
      'Purpose and retention shown to contributors',
      SALE_RESTRICTED_STATEMENT,
    ],
    cta: { label: 'Become a buyer', href: '/org/register' },
  },
]

export function PricingTable() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {TIERS.map((tier) => (
        <Card key={tier.name} className="flex h-full flex-col">
          <CardHeader>
            <CardTitle as="h2" className="text-xl">
              {tier.name}
            </CardTitle>
            <div className="mt-2">
              <span className="text-3xl font-bold">{tier.price}</span>
              {tier.cadence && (
                <span className="ml-1 text-sm text-muted-foreground">{tier.cadence}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tier.audience}</p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <ul className="space-y-2 text-sm">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <Button asChild className="w-full" variant={tier.primary ? 'default' : 'outline'}>
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
