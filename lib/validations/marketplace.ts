import { z } from 'zod'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'

/** Categories a pool/contribution can target. Mirrors the migration CHECK. */
export const dataCategorySchema = z.enum([
  'personal',
  'health',
  'financial',
  'credentials',
  'location',
  'interests',
  'browsing',
  'other',
])
export type DataCategory = z.infer<typeof dataCategorySchema>

export const MARKETPLACE_RESTRICTED_CATEGORIES = [
  'health',
  'financial',
  'location',
  'browsing',
] as const satisfies readonly DataCategory[]

function isRestrictedCategory(category: string | null | undefined): boolean {
  return (MARKETPLACE_RESTRICTED_CATEGORIES as readonly string[]).includes(category ?? '')
}

export function isMarketplaceCategoryAllowed(category: DataCategory): boolean {
  return !isRestrictedCategory(category)
}

/**
 * Schema types that hold restricted data whatever category an entry is filed
 * under. A medical record filed under "personal" is still health data. Tracker
 * summaries are browsing data even though they are filed under "other", so they
 * are named rather than inferred. The database refuses the same list; a test
 * holds the two together.
 */
export const SALE_RESTRICTED_SCHEMA_TYPES: readonly string[] = [
  ...Object.entries(VAULT_SCHEMA_TYPES)
    .filter(([, definition]) => isRestrictedCategory(definition.category))
    .map(([schemaType]) => schemaType),
  'browsing_insight',
].sort()

/** True when an entry, or a contribution made from one, can never be sold. */
export function isSaleRestrictedEntry(entry: {
  category?: string | null
  schema_type?: string | null
}): boolean {
  return (
    isRestrictedCategory(entry.category) ||
    (typeof entry.schema_type === 'string' && SALE_RESTRICTED_SCHEMA_TYPES.includes(entry.schema_type))
  )
}

/**
 * A contribution is judged by its own columns and by the vault entry it came
 * from. Before 2026-10-08 a contribution recorded the pool's category rather
 * than the entry's, so the entry is the only record of what the data was.
 */
export function isSaleRestrictedContribution(contribution: {
  category?: string | null
  schema_type?: string | null
  vault_data?: { category?: string | null; schema_type?: string | null } | null
}): boolean {
  return (
    isSaleRestrictedEntry(contribution) ||
    (contribution.vault_data != null && isSaleRestrictedEntry(contribution.vault_data))
  )
}

/** "Health, financial, location, and browsing data". */
export function describeRestrictedCategories(): string {
  const [first, ...rest] = MARKETPLACE_RESTRICTED_CATEGORIES
  const named = [first.charAt(0).toUpperCase() + first.slice(1), ...rest]
  return named.length > 1
    ? `${named.slice(0, -1).join(', ')}, and ${named[named.length - 1]} data`
    : `${named[0]} data`
}

/** "Health, financial, location, and browsing data are never for sale", without a full stop. */
export const SALE_RESTRICTED_STATEMENT = `${describeRestrictedCategories()} are never for sale`

export const marketplacePurposeSchema = z.enum([
  'research',
  'ai_training',
  'analytics',
  'product_improvement',
  'marketing',
  'other',
])
export type MarketplacePurpose = z.infer<typeof marketplacePurposeSchema>

export const MARKETPLACE_PURPOSE_LABELS: Record<MarketplacePurpose, string> = {
  research: 'Research',
  ai_training: 'AI model training',
  analytics: 'Analytics',
  product_improvement: 'Product improvement',
  marketing: 'Marketing',
  other: 'Other',
}

export const pricingModelSchema = z.enum(['snapshot', 'subscription', 'filtered'])
export type PricingModel = z.infer<typeof pricingModelSchema>

/** Buyer creates/updates a data pool (the dataset request individuals contribute to). */
export const createPoolSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  description: z.string().max(1000).optional(),
  category: dataCategorySchema
    .refine(isMarketplaceCategoryAllowed, {
      message: 'This category is not available for marketplace sale',
    })
    .default('personal'),
  purpose: marketplacePurposeSchema.default('research'),
  minimum_contributors: z.number().int().min(5).max(100_000).default(5),
  // LD-501: the smallest cohort a released record may sit in. A buyer can raise
  // it, never lower it below the floor, because k is what stops a release from
  // singling someone out.
  k_anonymity_target: z.number().int().min(5).max(1000).default(5),
  retention_days: z.number().int().min(1).max(365).default(30),
  requested_fields: z.array(z.string().min(1)).default([]),
  pricing_model: z.literal('snapshot').default('snapshot'),
  price_cents: z.number().int().min(0).max(100_000_00).default(0),
  price_per_record_cents: z.number().int().min(0).max(1_000_00).default(0),
  filters: z.record(z.string(), z.any()).optional(),
})
export type CreatePoolInput = z.infer<typeof createPoolSchema>

/** A single field the browser anonymized for a contribution (value already stripped/allowed). */
export const anonymizedFieldSchema = z.object({
  field_key: z.string().min(1),
  value: z.any(),
})

/**
 * User contributes one vault entry's approved fields to a pool. The payload is
 * produced in the browser (decrypt -> allowlist -> strip identifiers) and is
 * intentionally server-readable.
 */
export const contributeSchema = z.object({
  pool_id: z.string().uuid(),
  vault_data_id: z.string().uuid(),
  category: dataCategorySchema.default('personal'),
  anonymized_payload: z.record(z.string(), z.any()).refine(
    (val) => Object.keys(val).length > 0,
    { message: 'At least one field must be shared' }
  ),
  accepted_terms: z.boolean().refine((accepted) => accepted, {
    message: 'You must accept the contribution terms',
  }),
})
export type ContributeInput = z.infer<typeof contributeSchema>

/** Buyer purchases a pool snapshot or subscription. Payment is stubbed. */
export const purchasePoolSchema = z.object({
  pool_id: z.string().uuid(),
  order_type: z.literal('snapshot').default('snapshot'),
})
export type PurchasePoolInput = z.infer<typeof purchasePoolSchema>

/** User-level "how/who do I sell to" controls. */
export const salePreferencesSchema = z.object({
  allowed_purposes: z.array(z.string().min(1)).default([]),
  blocked_buyer_orgs: z.array(z.string().uuid()).default([]),
  min_price_cents: z.number().int().min(0).max(1_000_00).default(0),
  auto_optin: z.boolean().default(false),
})
export type SalePreferencesInput = z.infer<typeof salePreferencesSchema>

/** Per-field monetization toggles for one vault entry. */
export const fieldMonetizationSchema = z.object({
  vault_data_id: z.string().uuid(),
  category: dataCategorySchema.default('personal'),
  fields: z
    .array(
      z.object({
        field_key: z.string().min(1),
        opted_in: z.boolean(),
      })
    )
    .min(1),
})
export type FieldMonetizationInput = z.infer<typeof fieldMonetizationSchema>

/** Buyer creates an incentive offer surfaced to users. */
export const createOfferSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  incentive: z.string().min(2).max(200),
  target_category: dataCategorySchema
    .refine(isMarketplaceCategoryAllowed, {
      message: 'This category is not available for marketplace sale',
    })
    .default('personal'),
})
export type CreateOfferInput = z.infer<typeof createOfferSchema>
