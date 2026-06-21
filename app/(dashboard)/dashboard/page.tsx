import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { getDataScore, getDataTracker, getDataMarket, getConsentActivity } from '@/lib/services/data-insights.service'
import { getAccountSecurity } from '@/lib/services/account.service'
import { getEarnings } from '@/lib/services/contribution.service'
import { listActiveOffers, listMyClaims } from '@/lib/services/offer.service'
import { DataTrackerChart } from '@/components/dashboard/data-tracker-chart'
import { DataScoreCard } from '@/components/dashboard/data-score-card'
import { RevenueDonut } from '@/components/dashboard/revenue-donut'
import { DataMarketDonut } from '@/components/dashboard/data-market-donut'
import { OffersList } from '@/components/dashboard/offers-list'
import { LearnCenter } from '@/components/dashboard/learn-center'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { formatCents } from '@/components/dashboard/chart-theme'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const [vaultResult, consentResult, score, tracker, market, earnings, offers, claims, consentActivity, security] =
    await Promise.all([
      supabase
        .from('vault_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('consents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('revoked', false),
      getDataScore(user.id),
      getDataTracker(user.id),
      getDataMarket(user.id),
      getEarnings(user.id),
      listActiveOffers(),
      listMyClaims(user.id),
      getConsentActivity(user.id),
      getAccountSecurity(user.id),
    ])

  const vaultCount = vaultResult.count ?? 0
  const consentCount = consentResult.count ?? 0
  const claimedOfferIds = claims.map((c) => c.offer_id)
  const buyersCount = tracker.reduce((sum, p) => sum + p.bought, 0)

  return (
    <div className="space-y-6">
      {security && !security.onboarding_completed && (
        <OnboardingWizard recoveryConfigured={!!security.recovery_codes_generated_at} />
      )}
      <div>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-muted-foreground">Your personal data bank at a glance</p>
      </div>

      {/* Tracker + score */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Data tracker</CardTitle>
              <CardDescription>What you shared vs. what buyers accessed</CardDescription>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{score.optedInFields}</span> fields
                shared
              </p>
              <p>
                <span className="font-semibold text-foreground">{buyersCount}</span> buyer accesses
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <DataTrackerChart data={tracker} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data score</CardTitle>
            <CardDescription>Profile completeness</CardDescription>
          </CardHeader>
          <CardContent>
            <DataScoreCard score={score} />
          </CardContent>
        </Card>
      </div>

      {/* Revenue + market */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Earnings by data category</CardDescription>
            </div>
            <span className="text-2xl font-bold">{formatCents(earnings.earnedThisMonthCents)}</span>
          </CardHeader>
          <CardContent>
            <RevenueDonut
              byCategory={earnings.byCategory}
              earnedThisMonthCents={earnings.earnedThisMonthCents}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data market</CardTitle>
            <CardDescription>Your data points by category</CardDescription>
          </CardHeader>
          <CardContent>
            <DataMarketDonut data={market} />
          </CardContent>
        </Card>
      </div>

      {/* Quick stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vault entries</CardDescription>
            <CardTitle className="text-3xl">{vaultCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/vault">View vault</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active consents</CardDescription>
            <CardTitle className="text-3xl">{consentCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/consent">Manage consents</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total earned</CardDescription>
            <CardTitle className="text-3xl">{formatCents(earnings.totalCents)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/marketplace">Open marketplace</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contributions</CardDescription>
            <CardTitle className="text-3xl">{earnings.activeContributions}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/marketplace">Sell your data</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Consent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Consent activity</CardTitle>
          <CardDescription>Time-bound access you have granted</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{consentActivity.active}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{consentActivity.expiringSoon}</div>
              <div className="text-xs text-muted-foreground">Expiring within 30 days</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{consentActivity.revoked}</div>
              <div className="text-xs text-muted-foreground">Revoked</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offers + learn */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your offers</CardTitle>
            <CardDescription>Incentives from buyers who want your data</CardDescription>
          </CardHeader>
          <CardContent>
            <OffersList offers={offers} claimedOfferIds={claimedOfferIds} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning center</CardTitle>
            <CardDescription>Understand and get the most from your data</CardDescription>
          </CardHeader>
          <CardContent>
            <LearnCenter />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
