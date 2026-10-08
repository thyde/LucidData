import type { z } from 'zod'
import { SCHEMA_VALIDATORS } from './vault-schemas'

/**
 * Check data typed into a schema form before it is encrypted. The server only
 * ever sees ciphertext, so this is the one place a malformed record can be
 * caught. Messages are written for the person filling in the form, keyed by
 * field so each one can sit next to its input.
 *
 * It checks and hands nothing back. Save the record you checked, never a
 * schema's parsed output: parsing fills in defaults the person did not choose,
 * so a past job would be saved as a current one, and it drops any field the
 * schema does not name.
 */
export type SchemaValidation =
  | { success: true }
  | {
      success: false
      /** One message per field, for the first problem with that field. */
      fieldErrors: Record<string, string>
      /** A problem with the record as a whole, such as no reading at all. */
      formError: string | null
    }

interface ZodLikeIssue {
  code: string
  path: PropertyKey[]
  message: string
  expected?: string
  minimum?: number | bigint
  maximum?: number | bigint
  origin?: string
}

const TYPE_HINTS: Record<string, string> = {
  number: 'Enter a number',
  boolean: 'Use true or false',
  array: 'Enter a list',
}

function describe(issue: ZodLikeIssue, value: unknown, required: boolean): string {
  const empty = value === undefined || value === ''
  if (empty && required && issue.code !== 'invalid_value') return 'This is required'
  switch (issue.code) {
    case 'invalid_type':
      return TYPE_HINTS[issue.expected ?? ''] ?? 'Enter a valid value'
    case 'too_small':
      if (issue.origin === 'string') return 'This is too short'
      return `Enter ${Number(issue.minimum)} or more`
    case 'too_big':
      if (issue.origin === 'string') return `Use ${Number(issue.maximum)} characters or fewer`
      return `Enter ${Number(issue.maximum)} or less`
    case 'invalid_value':
      return 'Choose one of the options'
    default:
      // Refinements and formats carry messages written for people already.
      return issue.message
  }
}

/**
 * JSON has no way to leave a value out except to omit the key, so producers
 * write null for a value they do not have. The extension does, for a tracker
 * summary that saw no third-party collector. A null counts as left out.
 */
function withoutNulls(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null))
}

export function validateSchemaData(schemaType: string, data: unknown): SchemaValidation {
  const validator = SCHEMA_VALIDATORS[schemaType]
  if (!validator) return { success: true }

  const record = withoutNulls(data)
  const result = validator.safeParse(record)
  if (result.success) return { success: true }

  // A field the schema can do without, or fills in itself, is not required.
  const shape = (validator as { shape?: Record<string, z.ZodType> }).shape ?? {}
  const isRequired = (field: string) => !shape[field] || !shape[field].safeParse(undefined).success
  const values = (record && typeof record === 'object' ? record : {}) as Record<string, unknown>

  const fieldErrors: Record<string, string> = {}
  let formError: string | null = null
  for (const issue of result.error.issues as ZodLikeIssue[]) {
    const field = issue.path[0]
    if (typeof field === 'string') {
      fieldErrors[field] ??= describe(issue, values[field], isRequired(field))
    } else if (issue.code === 'invalid_type') {
      formError ??= 'Enter the data as a JSON object'
    } else {
      formError ??= issue.message
    }
  }
  return { success: false, fieldErrors, formError }
}

/**
 * The same problems as one sentence, for a place with no input to pin them to.
 * Names the fields by their keys, as a JSON editor shows them, unless labels
 * are given.
 */
export function summarizeSchemaErrors(
  failure: { fieldErrors: Record<string, string>; formError: string | null },
  labels: Record<string, string> = {}
): string {
  const parts = Object.entries(failure.fieldErrors).map(
    ([field, message]) => `${labels[field] ?? field}: ${message}`
  )
  if (failure.formError) parts.unshift(failure.formError)
  return parts.join('. ')
}
