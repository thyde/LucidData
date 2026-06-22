'use server'

import { createClient } from '@/lib/supabase/server'
import {
  createOnboardingLink,
  getPayoutOverview,
  type PayoutOverview,
} from '@/lib/services/payout.service'

async function getAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user
}

/** Start (or resume) Stripe Connect onboarding for the current user's payouts. */
export async function startPayoutOnboardingAction(): Promise<{ url: string }> {
  const user = await getAuthedUser()
  const url = await createOnboardingLink(user.id, user.email ?? null)
  return { url }
}

/** Current payout/connect status and ledger for the signed-in user. */
export async function getPayoutOverviewAction(): Promise<PayoutOverview> {
  const user = await getAuthedUser()
  return getPayoutOverview(user.id)
}
