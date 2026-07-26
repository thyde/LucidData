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
  const claim = await offerRepo.claimOffer(offerId)
  await createAuditEntry({
    userId,
    eventType: 'offer_claimed',
    action: 'Claimed a buyer offer',
    metadata: { offer_id: offerId, claim_id: claim.id, status: claim.status },
  })
  return claim
}

export async function withdrawOfferClaim(
  userId: string,
  claimId: string
): Promise<OfferClaim> {
  const claim = await offerRepo.withdrawClaim(claimId)
  await createAuditEntry({
    userId,
    eventType: 'offer_claim_withdrawn',
    action: `Removed claimed offer "${claim.offer_title}"`,
    metadata: { offer_id: claim.offer_id, claim_id: claim.id },
  })
  return claim
}

export async function redeemOfferClaim(
  orgId: string,
  actingUserId: string,
  code: string
): Promise<OfferClaim> {
  const claim = await offerRepo.redeemClaim(orgId, code)
  await createAuditEntry({
    userId: actingUserId,
    eventType: 'offer_redeemed',
    action: `Redeemed offer "${claim.offer_title}"`,
    actorType: 'buyer',
    metadata: { offer_id: claim.offer_id, claim_id: claim.id, organization_id: orgId },
  })
  return claim
}

export async function listOrgOffers(orgId: string): Promise<Offer[]> {
  return offerRepo.findOffersByOrg(orgId)
}

export interface OfferClaimStats {
  offerId: string
  claimed: number
  redeemed: number
}

/** Per-offer claim counts for the buyer portal. Counts only, no user identities. */
export async function getOfferClaimStats(orgId: string): Promise<OfferClaimStats[]> {
  const rows = await offerRepo.findClaimStatusesByOrg(orgId)
  const byOffer = new Map<string, OfferClaimStats>()
  for (const row of rows) {
    const stat = byOffer.get(row.offer_id) ?? { offerId: row.offer_id, claimed: 0, redeemed: 0 }
    if (row.status === 'claimed') stat.claimed += 1
    if (row.status === 'redeemed') stat.redeemed += 1
    byOffer.set(row.offer_id, stat)
  }
  return Array.from(byOffer.values())
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

export async function closeOfferForOrg(
  orgId: string,
  actingUserId: string,
  offerId: string
): Promise<Offer> {
  const offer = await offerRepo.updateOffer(offerId, orgId, { status: 'closed' })
  await createAuditEntry({
    userId: actingUserId,
    eventType: 'offer_closed',
    action: `Closed offer "${offer.title}"`,
    actorType: 'buyer',
    metadata: { offer_id: offer.id, organization_id: orgId },
  })
  return offer
}
