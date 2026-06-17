import * as offerRepo from '@/lib/repositories/offer.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { Offer, OfferClaim } from '@/types/database.types'
import type { CreateOfferInput } from '@/lib/validations/marketplace'

export async function listActiveOffers(): Promise<Offer[]> {
  return offerRepo.findActiveOffers()
}

export async function listMyClaims(userId: string): Promise<OfferClaim[]> {
  return offerRepo.findClaimsByUser(userId)
}

/** Record that a user accepted an offer. Recording only — no auto-consent. */
export async function claimOffer(userId: string, offerId: string): Promise<OfferClaim> {
  const claim = await offerRepo.createClaim({ offer_id: offerId, user_id: userId })
  await createAuditEntry({
    userId,
    eventType: 'offer_claimed',
    action: 'Claimed a buyer offer',
    metadata: { offer_id: offerId },
  })
  return claim
}

export async function listOrgOffers(orgId: string): Promise<Offer[]> {
  return offerRepo.findOffersByOrg(orgId)
}

export async function createOfferForOrg(
  orgId: string,
  actingUserId: string,
  input: CreateOfferInput
): Promise<Offer> {
  const offer = await offerRepo.createOffer({
    buyer_org_id: orgId,
    title: input.title,
    description: input.description ?? null,
    incentive: input.incentive,
    target_category: input.target_category,
  })
  await createAuditEntry({
    userId: actingUserId,
    eventType: 'offer_created',
    action: `Created offer "${offer.title}"`,
    actorType: 'buyer',
    metadata: { offer_id: offer.id, organization_id: orgId },
  })
  return offer
}
