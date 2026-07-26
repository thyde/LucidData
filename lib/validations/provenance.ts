import { z } from 'zod'

/**
 * LD-202 provenance validation.
 *
 * `source_provider`, `source_record_id`, and `source_captured_at` sit outside
 * the encryption envelope. That is deliberate, because a provenance field you
 * have to decrypt cannot answer "which source produced this" in a list view.
 * The cost is that anything written here is readable by the server, so the
 * shape has to be narrow enough that content cannot fit through it.
 *
 * The rule is: identifiers, never labels. A provider slug and whatever opaque
 * key the provider uses for the record. No spaces, no prose, no punctuation
 * that suggests a sentence. The database enforces the same patterns, so a
 * caller that skips this module still cannot write a note into a column that
 * we tell people only holds identifiers.
 */

/** A short lowercase slug, for example `strava` or `fitbit`. */
export const SOURCE_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/

/**
 * An opaque provider key. Wide enough for numeric ids, ULIDs, UUIDs, base64url
 * and URN-style keys. Narrow enough that a sentence cannot pass: no spaces, no
 * comma, no full stop followed by a space, no apostrophe.
 */
export const SOURCE_RECORD_ID_PATTERN = /^[A-Za-z0-9._:@=-]{1,128}$/

export const sourceProviderSchema = z
  .string()
  .regex(SOURCE_PROVIDER_PATTERN, 'Provider must be a short lowercase identifier')

export const sourceRecordIdSchema = z
  .string()
  .regex(
    SOURCE_RECORD_ID_PATTERN,
    'Record identifier must be opaque. Provenance fields cannot carry record content'
  )

export const sourceCapturedAtSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Capture time must be a valid timestamp')

export const provenanceSchema = z
  .object({
    source_provider: sourceProviderSchema.optional(),
    source_record_id: sourceRecordIdSchema.optional(),
    source_captured_at: sourceCapturedAtSchema.optional(),
  })
  .refine(
    (value) => !value.source_record_id || Boolean(value.source_provider),
    'A record identifier needs the provider that issued it'
  )

export type ProvenanceInput = z.infer<typeof provenanceSchema>

/**
 * Validate provenance before it is written.
 *
 * Returns the normalized subset rather than the whole payload, so a caller
 * cannot accidentally pass extra keys straight into an insert.
 */
export function parseProvenance(input: unknown): ProvenanceInput {
  return provenanceSchema.parse(input ?? {})
}

/**
 * True when a value looks like content rather than an identifier.
 *
 * Used for messages and tests. The schemas above are the enforcement; this is
 * the explanation of why something was refused.
 */
export function looksLikeContent(value: string): boolean {
  return /\s/.test(value) || /[,;'"?!]/.test(value) || value.length > 128
}
