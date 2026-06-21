import * as poolRepo from '@/lib/repositories/pool.repository'
import * as monetizationRepo from '@/lib/repositories/monetization.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import {
  DATA_TYPE_PRICING,
  suggestedAccessFeeCents,
  suggestedPerRecordCents,
  type Sensitivity,
} from '@/lib/constants/data-pricing'
import type { DataPool } from '@/types/database.types'
import type { CreatePoolInput, DataCategory } from '@/lib/validations/marketplace'
import type { Json } from '@/types/database.types'

/** Open pools individuals can browse and contribute to. */
export async function listOpenPools(category?: string): Promise<DataPool[]> {
  return poolRepo.findOpenPools(category)
}

export async function getOpenPool(id: string): Promise<DataPool | null> {
  return poolRepo.findOpenPoolById(id)
}

export interface MarketSupplyRow {
  category: DataCategory
  label: string
  sensitivity: Sensitivity
  sellers: number
  fields: number
  activeContributors: number
  suggestedAccessFeeCents: number
  suggestedPerRecordCents: number
}

/** Anonymized opted-in supply by category, enriched with suggested pricing. Buyer-facing. */
export async function getMarketSupply(): Promise<MarketSupplyRow[]> {
  const supply = await monetizationRepo.aggregateSupplyByCategory()
  return supply
    .filter((s) => s.category in DATA_TYPE_PRICING)
    .map((s) => {
      const category = s.category as DataCategory
      const pricing = DATA_TYPE_PRICING[category]
      return {
        category,
        label: pricing.label,
        sensitivity: pricing.sensitivity,
        sellers: s.sellers,
        fields: s.fields,
        activeContributors: s.activeContributors,
        suggestedAccessFeeCents: suggestedAccessFeeCents(category),
        suggestedPerRecordCents: suggestedPerRecordCents(category),
      }
    })
    .sort((a, b) => b.sellers - a.sellers || b.fields - a.fields)
}

/** Pools an org owns (buyer side). */
export async function listOrgPools(orgId: string): Promise<DataPool[]> {
  return poolRepo.findPoolsByOrg(orgId)
}

export async function getOrgPool(id: string, orgId: string): Promise<DataPool | null> {
  return poolRepo.findPoolByOrg(id, orgId)
}

/** Buyer creates a data pool (request). `actingUserId` is the org member acting. */
export async function createPoolForOrg(
  orgId: string,
  actingUserId: string,
  input: CreatePoolInput
): Promise<DataPool> {
  const pool = await poolRepo.createPool({
    buyer_org_id: orgId,
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    requested_fields: input.requested_fields,
    pricing_model: input.pricing_model,
    price_cents: input.price_cents,
    price_per_record_cents: input.price_per_record_cents,
    filters: (input.filters as Json) ?? null,
  })
  await createAuditEntry({
    userId: actingUserId,
    eventType: 'data_pool_created',
    action: `Created data pool "${pool.name}" (${pool.category})`,
    actorType: 'buyer',
    metadata: { pool_id: pool.id, organization_id: orgId },
  })
  return pool
}

export async function closePool(id: string, orgId: string, actingUserId: string): Promise<DataPool> {
  const pool = await poolRepo.updatePool(id, orgId, { status: 'closed' })
  await createAuditEntry({
    userId: actingUserId,
    eventType: 'data_pool_closed',
    action: `Closed data pool "${pool.name}"`,
    actorType: 'buyer',
    metadata: { pool_id: id, organization_id: orgId },
  })
  return pool
}
