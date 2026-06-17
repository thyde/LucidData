import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Tier {
  name: string
  price: string
  cadence?: string
  audience: string
  features: string[]
  cta: { label: string; href: string }
  featured?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Individual',
    price: 'Free',
    audience: 'For people who want to own their data',
    features: [
      'Encrypted personal data vault',
      'Marketplace + per-field sell controls',
      'Earnings dashboard',
      'Immutable audit log',
    ],
    cta: { label: 'Create account', href: '/register' },
  },
  {
    name: 'Business',
    price: 'Free',
    cadence: 'to start',
    audience: 'Issue and verify credentials',
    features: [
      'Issue verifiable credentials',
      'Verify shared credentials',
      'Domain verification + API keys',
      'Usage-based issuance quotas',
    ],
    cta: { label: 'Register organization', href: '/org/register' },
    featured: true,
  },
  {
    name: 'Data buyer',
    price: 'Pay per dataset',
    audience: 'Buy bulk anonymized data',
    features: [
      'Browse consented data pools',
      'Snapshot, subscription, or filtered buys',
      'Anonymized dataset exports',
      'Offers to incentivize sharing',
    ],
    cta: { label: 'Become a buyer', href: '/org/register' },
  },
]

export function PricingTable() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {TIERS.map((tier) => (
        <Card
          key={tier.name}
          className={cn('flex h-full flex-col', tier.featured && 'border-primary shadow-md')}
        >
          <CardHeader>
            {tier.featured && (
              <span className="mb-2 inline-block w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Most popular
              </span>
            )}
            <CardTitle className="text-xl">{tier.name}</CardTitle>
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
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Button asChild className="w-full" variant={tier.featured ? 'default' : 'outline'}>
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
