import type { Metadata } from 'next'
import { PricingTable } from '@/components/marketing/pricing-table'

export const metadata: Metadata = {
  title: 'Pricing | LucidData',
  description: 'Simple pricing for individuals, businesses, and data buyers.',
}

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
        <p className="mt-3 text-muted-foreground">
          Owning your data is free. Businesses pay only for what they issue, verify, or buy.
        </p>
      </div>
      <div className="mt-12">
        <PricingTable />
      </div>
    </div>
  )
}
