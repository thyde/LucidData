'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createCheckoutAction, createBillingPortalAction } from '@/lib/actions/billing.actions'
import { PLAN_CATALOG, formatPlanPrice } from '@/lib/constants/billing-plans'
import type { UsageSummary } from '@/lib/services/billing.service'

const UPGRADE_PLANS = ['starter', 'growth'] as const

interface PlanBillingProps {
  orgId: string
  usage: UsageSummary
  canManageBilling: boolean
  stripeEnabled: boolean
}

export function PlanBilling({ orgId, usage, canManageBilling, stripeEnabled }: PlanBillingProps) {
  const searchParams = useSearchParams()
  const billingStatus = searchParams.get('billing')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout(plan: string) {
    setError(null)
    setPending(plan)
    try {
      const { url } = await createCheckoutAction(orgId, plan)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
      setPending(null)
    }
  }

  async function openPortal() {
    setError(null)
    setPending('portal')
    try {
      const { url } = await createBillingPortalAction(orgId)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the billing portal.')
      setPending(null)
    }
  }

  const isPaid = usage.plan !== 'free' && usage.plan !== 'enterprise'
  const upgradeTargets = UPGRADE_PLANS.filter((plan) => plan !== usage.plan)

  return (
    <div className="border rounded-lg p-5 bg-background">
      {billingStatus === 'success' && (
        <p className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          Subscription updated. It can take a moment to show here.
        </p>
      )}
      {billingStatus === 'cancelled' && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Checkout cancelled. Your plan was not changed.
        </p>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium capitalize">{usage.plan} plan</p>
          <p className="text-sm text-muted-foreground">This month&apos;s usage</p>
        </div>
        {!stripeEnabled && (
          <span className="text-xs text-muted-foreground">Billing not configured</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
        <div>
          <p className="text-muted-foreground">Credentials issued</p>
          <p className="font-medium">
            {usage.issuedThisMonth}
            {usage.issuanceLimit < Number.MAX_SAFE_INTEGER && (
              <span className="text-muted-foreground"> / {usage.issuanceLimit}</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Verifications</p>
          <p className="font-medium">{usage.verifiedThisMonth}</p>
        </div>
      </div>

      {stripeEnabled && canManageBilling && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          {upgradeTargets.map((plan) => (
            <Button
              key={plan}
              size="sm"
              variant={plan === 'growth' ? 'default' : 'outline'}
              disabled={pending !== null}
              onClick={() => startCheckout(plan)}
            >
              {pending === plan
                ? 'Redirecting'
                : `Upgrade to ${PLAN_CATALOG[plan].name} (${formatPlanPrice(PLAN_CATALOG[plan].amountCents)}/mo)`}
            </Button>
          ))}
          {isPaid && (
            <Button size="sm" variant="ghost" disabled={pending !== null} onClick={openPortal}>
              {pending === 'portal' ? 'Opening' : 'Manage billing'}
            </Button>
          )}
        </div>
      )}

      {stripeEnabled && !canManageBilling && (
        <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
          Only organization owners can change the billing plan.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
