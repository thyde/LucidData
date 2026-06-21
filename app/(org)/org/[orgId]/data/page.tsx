import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { listOrgPools, getMarketSupply } from '@/lib/services/marketplace.service'
import { listOrders } from '@/lib/services/data-order.service'
import { listOrgOffers } from '@/lib/services/offer.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreatePoolDialog } from '@/components/buyer/create-pool-dialog'
import { CreateOfferDialog } from '@/components/buyer/create-offer-dialog'
import { DatasetBrowser } from '@/components/buyer/dataset-browser'
import { OrdersList } from '@/components/buyer/orders-list'
import { SupplyDiscovery } from '@/components/buyer/supply-discovery'
import { categoryLabel } from '@/components/dashboard/chart-theme'

export default async function BuyerPortalPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params

  let membership
  try {
    membership = await requireOrgMembership(orgId)
  } catch {
    notFound()
  }

  if (!membership.organization.data_buyer) {
    notFound()
  }

  const [pools, orders, offers, supply] = await Promise.all([
    listOrgPools(orgId),
    listOrders(orgId),
    listOrgOffers(orgId),
    getMarketSupply(),
  ])

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/org/${orgId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {membership.organization.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Data marketplace</h1>
            <p className="mt-1 text-muted-foreground">
              Create data pools, purchase datasets, and offer incentives.
            </p>
          </div>
          <div className="flex gap-2">
            <CreatePoolDialog orgId={orgId} />
            <CreateOfferDialog orgId={orgId} />
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Available supply</h2>
          <p className="text-sm text-muted-foreground">
            Anonymized counts of opted-in data by category. Use these to target a new pool or offer.
          </p>
        </div>
        <SupplyDiscovery rows={supply} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Your data pools</h2>
        <DatasetBrowser orgId={orgId} pools={pools} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Purchases</h2>
        <Card>
          <CardContent className="pt-6">
            <OrdersList orgId={orgId} orders={orders} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Your offers</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offers yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {offers.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{categoryLabel(offer.target_category)}</Badge>
                    <Badge variant={offer.status === 'active' ? 'default' : 'outline'}>
                      {offer.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-base">{offer.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {offer.incentive}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
