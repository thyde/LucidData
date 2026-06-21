import { z } from 'zod'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'

/** Credential schema types an organization may request (excludes free-form custom). */
export const REQUESTABLE_SCHEMA_TYPES = Object.keys(VAULT_SCHEMA_TYPES).filter(
  (key) => key !== 'custom'
)

/** Input an organization submits to request credentials from a user. */
export const createCredentialRequestSchema = z.object({
  subjectEmail: z.string().email(),
  purpose: z.string().min(10).max(500),
  requestedSchemaTypes: z
    .array(z.string().min(1))
    .min(1, 'Select at least one credential type')
    .max(10),
  message: z.string().max(1000).optional(),
  expiresInDays: z.number().int().min(1).max(365).default(30),
})
export type CreateCredentialRequestInput = z.infer<typeof createCredentialRequestSchema>

/** A single credential the user chooses to share, with the fields to disclose. */
export const fulfillSelectionSchema = z.object({
  credentialId: z.string().uuid(),
  disclosedClaims: z.array(z.string().min(1)).min(1),
})

/** Input the user submits to fulfill a credential request. */
export const fulfillCredentialRequestSchema = z.object({
  selections: z.array(fulfillSelectionSchema).min(1, 'Select at least one credential'),
})
export type FulfillCredentialRequestInput = z.infer<typeof fulfillCredentialRequestSchema>
