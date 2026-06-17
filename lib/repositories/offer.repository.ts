import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Offer, InsertOffer, OfferClaim, InsertOfferClaim } from '@/types/database.types'

/** Active offers any authenticated user can see (RLS). */
export async function findActiveOffers(): Promise<Offer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Offers created by an org — buyer-side, service role. */
export async function findOffersByOrg(orgId: string): Promise<Offer[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('offers')
    .select('*')
    .eq('buyer_org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createOffer(offer: InsertOffer): Promise<Offer> {
  const service = createServiceClient()
  const { data, error } = await service.from('offers').insert(offer).select('*').single()
  if (error) throw error
  return data
}

export async function findClaimsByUser(userId: string): Promise<OfferClaim[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offer_claims')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

export async function createClaim(claim: InsertOfferClaim): Promise<OfferClaim> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offer_claims')
    .upsert(claim, { onConflict: 'offer_id,user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}
