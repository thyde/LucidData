import { z } from 'zod'

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

export const pricingModelSchema = z.enum(['snapshot', 'subscription', 'filtered'])
export type PricingModel = z.infer<typeof pricingModelSchema>

/** Buyer creates/updates a data pool (the dataset request individuals contribute to). */
export const createPoolSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  description: z.string().max(1000).optional(),
  category: dataCategorySchema.default('personal'),
  requested_fields: z.array(z.string().min(1)).default([]),
  pricing_model: pricingModelSchema.default('snapshot'),
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
  vault_data_id: z.string().uuid().optional(),
  category: dataCategorySchema.default('personal'),
  anonymized_payload: z.record(z.string(), z.any()).refine(
    (val) => Object.keys(val).length > 0,
    { message: 'At least one field must be shared' }
  ),
})
export type ContributeInput = z.infer<typeof contributeSchema>

/** Buyer purchases a pool snapshot or subscription. Payment is stubbed. */
export const purchasePoolSchema = z.object({
  pool_id: z.string().uuid(),
  order_type: z.enum(['snapshot', 'subscription']).default('snapshot'),
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
  target_category: dataCategorySchema.default('personal'),
})
export type CreateOfferInput = z.infer<typeof createOfferSchema>
