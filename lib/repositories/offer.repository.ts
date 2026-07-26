import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Offer, InsertOffer, OfferClaim, UpdateOffer } from '@/types/database.types'

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

export async function updateOffer(
  offerId: string,
  orgId: string,
  update: UpdateOffer
): Promise<Offer> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('offers')
    .update(update)
    .eq('id', offerId)
    .eq('buyer_org_id', orgId)
    .select('*')
    .single()
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

/** Claim counts for a buyer's offers. Never exposes who claimed an offer. */
export async function findClaimStatusesByOrg(
  orgId: string
): Promise<{ offer_id: string; status: string }[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('offer_claims')
    .select('offer_id, status')
    .eq('buyer_org_id', orgId)
  if (error) throw error
  return data ?? []
}

export async function claimOffer(offerId: string): Promise<OfferClaim> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('claim_offer_atomic', { p_offer_id: offerId })
  if (error) throw error
  const claim = data?.[0]
  if (!claim) throw new Error('Offer claim was not created')
  return claim
}

export async function withdrawClaim(claimId: string): Promise<OfferClaim> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('withdraw_offer_claim_atomic', {
    p_claim_id: claimId,
  })
  if (error) throw error
  const claim = data?.[0]
  if (!claim) throw new Error('Offer claim was not removed')
  return claim
}

export async function redeemClaim(orgId: string, code: string): Promise<OfferClaim> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('redeem_offer_claim_atomic', {
    p_organization_id: orgId,
    p_redemption_code: code,
  })
  if (error) throw error
  const claim = data?.[0]
  if (!claim) throw new Error('Offer code was not redeemed')
  return claim
}
