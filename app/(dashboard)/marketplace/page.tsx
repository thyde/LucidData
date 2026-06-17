import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listOpenPools } from '@/lib/services/marketplace.service'
import { listMyContributions, getEarnings } from '@/lib/services/contribution.service'
import { getSalePreferences } from '@/lib/services/monetization.service'
import { PoolList } from '@/components/marketplace/pool-list'
import { MyContributions } from '@/components/marketplace/my-contributions'
import { SalePreferencesForm } from '@/components/marketplace/sale-preferences-form'
import { DataValueGuide } from '@/components/marketplace/data-value-guide'
import { findVaultByUserId } from '@/lib/repositories/vault.repository'
import { formatCents } from '@/components/dashboard/chart-theme'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [pools, contributions, earnings, prefs, vault] = await Promise.all([
    listOpenPools(),
    listMyContributions(user.id),
    getEarnings(user.id),
    getSalePreferences(user.id),
    findVaultByUserId(user.id),
  ])
  const yourCategories = Array.from(new Set(vault.map((v) => v.category)))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Marketplace</h1>
        <p className="mt-1 text-muted-foreground">
          Decide how and to whom you sell your data, and earn when buyers buy it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Earned this month</CardDescription>
            <CardTitle className="text-3xl">{formatCents(earnings.earnedThisMonthCents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total earned</CardDescription>
            <CardTitle className="text-3xl">{formatCents(earnings.totalCents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active contributions</CardDescription>
            <CardTitle className="text-3xl">{earnings.activeContributions}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <DataValueGuide yourCategories={yourCategories} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Open data pools</h2>
          <p className="text-sm text-muted-foreground">
            Buyers are requesting these datasets. Contribute the fields you choose.
          </p>
        </div>
        <PoolList pools={pools} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Your contributions</h2>
        <Card>
          <CardContent className="pt-6">
            <MyContributions contributions={contributions} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Sale preferences</h2>
          <p className="text-sm text-muted-foreground">Control how and to whom you sell.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <SalePreferencesForm initial={prefs} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
