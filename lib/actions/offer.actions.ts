'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import {
  listActiveOffers,
  listMyClaims,
  claimOffer,
  listOrgOffers,
  createOfferForOrg,
} from '@/lib/services/offer.service'
import { createOfferSchema } from '@/lib/validations/marketplace'
import type { Offer, OfferClaim } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getActiveOffersAction(): Promise<Offer[]> {
  await getAuthenticatedUserId()
  return listActiveOffers()
}

export async function getMyClaimsAction(): Promise<OfferClaim[]> {
  const userId = await getAuthenticatedUserId()
  return listMyClaims(userId)
}

export async function claimOfferAction(offerId: string): Promise<OfferClaim> {
  const userId = await getAuthenticatedUserId()
  return claimOffer(userId, offerId)
}

export async function getOrgOffersAction(orgId: string): Promise<Offer[]> {
  await requireOrgMembership(orgId)
  return listOrgOffers(orgId)
}

export async function createOfferAction(orgId: string, input: unknown): Promise<Offer> {
  const userId = await getAuthenticatedUserId()
  const membership = await requireOrgMembership(orgId)
  if (!membership.organization.data_buyer) {
    throw new Error('This organization is not enabled for data purchasing')
  }
  const parsed = createOfferSchema.parse(input)
  return createOfferForOrg(orgId, userId, parsed)
}
