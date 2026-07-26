import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  PayoutAccount,
  InsertPayoutAccount,
  UpdatePayoutAccount,
  Payout,
  InsertPayout,
  UpdatePayout,
} from '@/types/database.types'

// --- payout_accounts (service role) ---

export async function findAccount(userId: string): Promise<PayoutAccount | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payout_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findAccountByStripeId(
  stripeAccountId: string
): Promise<PayoutAccount | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payout_accounts')
    .select('*')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertAccount(account: InsertPayoutAccount): Promise<PayoutAccount> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payout_accounts')
    .upsert(account, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateAccount(
  userId: string,
  patch: UpdatePayoutAccount
): Promise<PayoutAccount> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payout_accounts')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// --- payouts ledger (service role) ---

export async function createPayout(payout: InsertPayout): Promise<Payout> {
  const service = createServiceClient()
  const { data, error } = await service.from('payouts').insert(payout).select('*').single()
  if (error) throw error
  return data
}

export async function updatePayout(id: string, patch: UpdatePayout): Promise<Payout> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payouts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function findPayoutsByOrder(orderId: string): Promise<Payout[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payouts')
    .select('*')
    .eq('data_order_id', orderId)
  if (error) throw error
  return data
}

/**
 * Payouts waiting to move.
 *
 * `includeHeld` pulls in balances stopped by the LD-506 review as well. Only
 * account closure passes it: a held balance is still owed, and closure is the
 * one moment where withholding it would mean keeping money we have no further
 * claim on.
 */
export async function findPendingPayouts(
  userId: string,
  options: { includeHeld?: boolean } = {}
): Promise<Payout[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payouts')
    .select('*')
    .eq('user_id', userId)
    .in('status', options.includeHeld ? ['pending', 'held'] : ['pending'])
  if (error) throw error
  return data
}

/**
 * Pending payouts across all users that are due for another attempt: either
 * never attempted (next_attempt_at is NULL) or past their backoff deadline.
 * Service role only; used by the scheduled job runner.
 */
export async function findDuePayouts(now: string, limit = 200): Promise<Payout[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payouts')
    .select('*')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data
}

/** The current user's payouts (RLS-scoped). */
export async function findPayoutsByUser(userId: string): Promise<Payout[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
