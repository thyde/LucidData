import { z } from 'zod'
import { dataCategorySchema } from '@/lib/validations/marketplace'

/**
 * LD-602 organization API schemas.
 *
 * These live here rather than inline in each route so the OpenAPI document can
 * be generated from the exact objects the handlers validate against. A
 * specification written separately drifts within weeks, and a drifted spec is
 * worse than none because integrators trust it.
 */

/**
 * The API version an unversioned request resolves to. Bump this when a
 * response shape changes in a way an existing integration would notice.
 */
export const ORG_API_VERSION = '2026-07-26'

export const organizationRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  website: z.string().url().optional(),
  org_type: z.enum(['issuer', 'verifier', 'both']).optional(),
  data_buyer: z.boolean().optional(),
})
export type OrganizationRegisterInput = z.infer<typeof organizationRegisterSchema>

export const organizationConsentRequestSchema = z.object({
  user_email: z.string().email(),
  purpose: z.string().min(10).max(500),
  access_level: z.enum(['read', 'export', 'verify']),
  data_category: dataCategorySchema.optional(),
  expires_in_days: z.number().min(1).max(365).default(30),
})
export type OrganizationConsentRequestInput = z.infer<
  typeof organizationConsentRequestSchema
>

export const organizationCredentialIssueSchema = z.object({
  subject_email: z.string().email(),
  schema_type: z.string().min(1),
  label: z.string().min(1).max(200),
  claims: z.record(z.string(), z.unknown()),
  expires_at: z.string().datetime().optional(),
})
export type OrganizationCredentialIssueInput = z.infer<
  typeof organizationCredentialIssueSchema
>
