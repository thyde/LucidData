import { z } from 'zod'
import { VAULT_SCHEMA_TYPES } from '../schemas/vault-schemas'
import { claimKeySaltSchema, setRecoveryEscrowSchema } from './account'
import { publishIngestionKeySchema, clearPendingIngestSchema } from './connector'
import { dataCategorySchema } from './marketplace'
import { sourceCapturedAtSchema, sourceProviderSchema, sourceRecordIdSchema } from './provenance'
import { addRecoveryFactorSchema } from './recovery'
import { stepUpActionSchema } from './session-security'

/**
 * LD-608 versioned client API.
 *
 * Every v1 handler validates against these schemas, and the OpenAPI document
 * at /api/v1/openapi is generated from them, so the contract a client reads is
 * the one the server enforces. Bodies use snake_case, like the database rows
 * the API returns.
 */

export const CLIENT_API_VERSION = '1.0.0'

const SCHEMA_TYPES = Object.keys(VAULT_SCHEMA_TYPES) as [string, ...string[]]

const isoDateTime = z.iso.datetime({ offset: true })

/** The encrypted envelope: never empty, never plaintext. */
const ciphertext = z.string().trim().min(1, 'client_ciphertext is required').max(2_000_000)
const wrappedKey = z.string().trim().min(1, 'encrypted_dek is required').max(4000)
const dekSalt = z.string().trim().min(1, 'dek_salt is required').max(200)

const label = z.string().trim().min(1, 'label is required').max(100)
const description = z.string().max(500)
const tags = z.array(z.string().trim().min(1).max(50)).max(20)

export const profileUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(100).optional(),
    key_hint: z.string().max(200).optional(),
    email_notifications_enabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Send at least one field to change',
  })

export const keySaltClaimSchema = z.object({
  key_salt: claimKeySaltSchema.shape.keySalt,
})

export const vaultEntryCreateSchema = z
  .object({
    label,
    description: description.optional(),
    category: dataCategorySchema.default('personal'),
    tags: tags.default([]),
    schema_type: z.enum(SCHEMA_TYPES).default('custom'),
    client_ciphertext: ciphertext,
    encrypted_dek: wrappedKey,
    dek_salt: dekSalt,
    expires_at: isoDateTime.optional(),
    source_provider: sourceProviderSchema.optional(),
    source_record_id: sourceRecordIdSchema
      .describe("The provider's own key for the record. Requires source_provider.")
      .optional(),
    source_captured_at: sourceCapturedAtSchema.optional(),
  })
  // The same rule the service applies to provenance, checked here so that a
  // batch refuses the whole request up front rather than failing entry by entry.
  .refine((value) => !value.source_record_id || Boolean(value.source_provider), {
    message: 'A record identifier needs the provider that issued it',
    path: ['source_record_id'],
  })

export const vaultEntryBatchCreateSchema = z.object({
  entries: z.array(vaultEntryCreateSchema).min(1).max(100),
})

export const vaultEntryUpdateSchema = z
  .object({
    label: label.optional(),
    description: description.optional(),
    category: dataCategorySchema.optional(),
    tags: tags.optional(),
    expires_at: isoDateTime.optional(),
    client_ciphertext: ciphertext.optional(),
    encrypted_dek: wrappedKey.optional(),
    dek_salt: dekSalt.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Send at least one field to change',
  })
  .refine(
    (value) => {
      const sent = [value.client_ciphertext, value.encrypted_dek, value.dek_salt].filter(
        (field) => field !== undefined
      ).length
      return sent === 0 || sent === 3
    },
    { message: 'client_ciphertext, encrypted_dek, and dek_salt must be sent together' }
  )

export const consentCreateSchema = z.object({
  vault_data_id: z.string().uuid().optional(),
  granted_to: z.string().trim().min(1).max(200),
  granted_to_name: z.string().trim().max(200).optional(),
  granted_to_email: z.email().optional(),
  access_level: z.enum(['read', 'export', 'verify']),
  purpose: z.string().trim().min(1).max(500),
  end_date: isoDateTime.optional(),
  data_category: dataCategorySchema.optional(),
})

export const consentRevokeSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(500),
})

export const consentExtendSchema = z.object({
  end_date: isoDateTime.refine((value) => Date.parse(value) > Date.now(), {
    message: 'end_date must be in the future',
  }),
})

export const consentRequestResponseSchema = z.object({
  response: z.enum(['approved', 'denied']),
  note: z.string().max(500).optional(),
})

export const credentialRequestFulfillSchema = z.object({
  selections: z
    .array(
      z.object({
        credential_id: z.string().uuid(),
        disclosed_claims: z.array(z.string().min(1)).min(1),
      })
    )
    .min(1, 'Select at least one credential'),
})

export const credentialRequestDenySchema = z.object({
  note: z.string().max(500).optional(),
})

export const shareCreateSchema = z.object({
  credential_id: z.string().uuid(),
  disclosed_claims: z.array(z.string().min(1)).min(1, 'Select at least one field to share').max(50),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  verifier_email: z.email().optional(),
})

export const credentialExportQuerySchema = z.object({
  format: z.string().min(1).max(40),
  version: z.string().min(1).max(20).optional(),
})

export const ingestionKeyPublishSchema = z.object({
  public_key: publishIngestionKeySchema.shape.publicKey,
  wrapped_private_key: publishIngestionKeySchema.shape.wrappedPrivateKey,
  salt: publishIngestionKeySchema.shape.salt,
})

export const ingestClearSchema = clearPendingIngestSchema

export const legalAcceptSchema = z.object({
  documents: z.array(z.enum(['terms', 'privacy'])).min(1),
})

export const healthConsentGrantSchema = z.object({
  source: z.enum(['settings', 'health-gate']).default('settings'),
})

export const stepUpRequestSchema = z.object({
  action: stepUpActionSchema,
  proof: z.string().min(1),
})

export const accountDeleteSchema = z.object({
  confirm_phrase: z.string(),
  step_up_token: z.string().min(1, 'Confirm your password to continue'),
})

/** The recovery-code escrow behind password-reset recovery: the master key wrapped on the device. */
export const recoveryEscrowSchema = setRecoveryEscrowSchema

export const recoveryFactorAddSchema = z.object({
  type: addRecoveryFactorSchema.shape.type,
  label: addRecoveryFactorSchema.shape.label,
  wrapped_master_key: addRecoveryFactorSchema.shape.wrappedMasterKey,
  salt: addRecoveryFactorSchema.shape.salt,
})
