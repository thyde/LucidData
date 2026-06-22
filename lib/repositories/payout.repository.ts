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

export async function findPendingPayouts(userId: string): Promise<Payout[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('payouts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
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
