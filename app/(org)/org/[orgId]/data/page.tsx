import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { listOrgPools, getMarketSupply } from '@/lib/services/marketplace.service'
import { listOrders } from '@/lib/services/data-order.service'
import { listOrgOffers, getOfferClaimStats } from '@/lib/services/offer.service'
import { Card, CardContent } from '@/components/ui/card'
import { CreatePoolDialog } from '@/components/buyer/create-pool-dialog'
import { CreateOfferDialog } from '@/components/buyer/create-offer-dialog'
import { DatasetBrowser } from '@/components/buyer/dataset-browser'
import { OrdersList } from '@/components/buyer/orders-list'
import { SupplyDiscovery } from '@/components/buyer/supply-discovery'
import { OfferManager } from '@/components/buyer/offer-manager'

export default async function BuyerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ order?: string }>
}) {
  const { orgId } = await params
  const { order: orderStatus } = await searchParams

  let membership
  try {
    membership = await requireOrgMembership(orgId)
  } catch {
    notFound()
  }

  if (!membership.organization.data_buyer) {
    notFound()
  }

  const [pools, orders, offers, supply, claimStats] = await Promise.all([
    listOrgPools(orgId),
    listOrders(orgId),
    listOrgOffers(orgId),
    getMarketSupply(),
    getOfferClaimStats(orgId),
  ])

  const isVerified = Boolean(membership.organization.verified_at)

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
            <CreatePoolDialog orgId={orgId} disabled={!isVerified} />
            <CreateOfferDialog orgId={orgId} disabled={!isVerified} />
          </div>
        </div>
      </div>

      {!isVerified && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm">
          <p className="font-medium text-yellow-950">
            Verify your organization before using the data marketplace
          </p>
          <p className="mt-1 text-yellow-900">
            People who share data need to know who is buying it. Once your organization is
            verified you can create data pools, publish offers, and buy datasets.
          </p>
          <Link
            href={`/org/${orgId}`}
            className="mt-2 inline-block font-medium text-yellow-950 underline"
          >
            Verify your organization
          </Link>
        </div>
      )}

      {orderStatus === 'success' && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          Payment received. Your dataset will be ready in Purchases below in a moment.
        </div>
      )}
      {orderStatus === 'cancelled' && (
        <div className="rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Checkout cancelled. No charge was made and the order was not completed.
        </div>
      )}

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
        <OfferManager orgId={orgId} initialOffers={offers} claimStats={claimStats} />
      </section>
    </div>
  )
}
