/**
 * LD-503 synthetic sample records.
 *
 * A buyer needs to see the shape of a dataset before paying for it. That
 * preview must be generated from the schema, never from real contributions,
 * even in aggregate: a small pool leaks under any transformation, and a
 * "representative" record drawn from real data is somebody's record.
 *
 * So this module has no access to the database by design. It takes a schema
 * type and produces plausible values from a fixed table of examples. Nothing
 * here can reach a contribution even by mistake.
 *
 * Values are deterministic for a given schema and index, so a buyer refreshing
 * a page sees the same sample and does not mistake variation for real data.
 */

import { SCHEMA_FORM_FIELDS, type FormField } from '@/lib/schemas/form-fields'
import { classifyField } from '@/lib/privacy/quasi-identifiers'
import { generalizeValue, type GeneralizedValue } from '@/lib/privacy/k-anonymity'

/** Stated on every sample so it cannot be mistaken for real data. */
export const SYNTHETIC_NOTICE =
  'Every value below is invented. Samples are generated from the schema, never from anyone\u2019s contribution.'

const TEXT_EXAMPLES: Record<string, string[]> = {
  employer: ['Northwind Logistics', 'Contoso Health', 'Fabrikam Retail'],
  role: ['Operations Analyst', 'Registered Nurse', 'Delivery Driver'],
  institution: ['Riverside College', 'Northgate University', 'Eastfield Institute'],
  field_of_study: ['Civil Engineering', 'Nursing', 'Economics'],
  nationality: ['GB', 'IE', 'DE'],
  issuing_country: ['GB', 'IE', 'DE'],
  currency: ['GBP', 'EUR', 'USD'],
  bank_name: ['Example Bank', 'Sample Building Society', 'Placeholder Credit Union'],
  source: ['strava', 'fitbit', 'manual'],
  gpa: ['3.4', '3.7', '2.9'],
}

const GENERIC_TEXT = ['Sample value', 'Example entry', 'Placeholder text']

function pick<T>(values: T[], index: number): T {
  return values[index % values.length]
}

function sampleValue(field: FormField, index: number): unknown {
  switch (field.type) {
    case 'select':
      return field.options && field.options.length > 0
        ? pick(field.options, index).value
        : pick(GENERIC_TEXT, index)
    case 'checkbox':
      return index % 2 === 0
    case 'number':
      return 100 + index * 37
    case 'date': {
      // Fixed base date so samples do not drift as the calendar moves.
      const base = Date.UTC(2024, 0, 15)
      return new Date(base + index * 86_400_000 * 29).toISOString().slice(0, 10)
    }
    case 'multi-text':
      return [pick(GENERIC_TEXT, index), pick(GENERIC_TEXT, index + 1)]
    case 'text':
    default:
      return pick(TEXT_EXAMPLES[field.name] ?? GENERIC_TEXT, index)
  }
}

export interface SyntheticSample {
  synthetic: true
  values: Record<string, GeneralizedValue | unknown>
}

/**
 * Build sample records for a schema, showing only the fields a buyer could
 * actually receive.
 *
 * Identifiers are omitted, because the release gate drops them, and showing a
 * name in a preview would misrepresent what is on offer. Quasi-identifiers are
 * shown generalized at the level the gate would apply, so the sample matches
 * the shape of a real delivery rather than the shape of the raw schema.
 */
export function buildSyntheticSamples(
  schemaType: string,
  options: { count?: number; generalizationLevels?: Record<string, number> } = {}
): SyntheticSample[] {
  const fields = SCHEMA_FORM_FIELDS[schemaType]
  if (!fields) return []

  const count = Math.max(1, Math.min(options.count ?? 3, 10))
  const levels = options.generalizationLevels ?? {}

  return Array.from({ length: count }, (_, index) => {
    const values: Record<string, unknown> = {}
    for (const field of fields) {
      const classification = classifyField(schemaType, field.name)
      // Unclassified fails closed in the release gate, so it must not appear
      // in a preview either. Showing it would promise data we cannot deliver.
      if (!classification) continue
      if (classification.privacyClass === 'identifier') continue

      const raw = sampleValue(field, index)
      if (classification.privacyClass === 'quasi_identifier') {
        const level = levels[field.name] ?? 0
        const widened = generalizeValue(
          classification.generalization ?? 'categorical',
          raw,
          level,
          classification.numericStep ?? 1
        )
        if (widened !== null) values[field.name] = widened
        continue
      }
      values[field.name] = raw
    }
    return { synthetic: true as const, values }
  })
}

/**
 * The fields a buyer would actually receive from this schema, with the reason
 * each one is included or withheld. This is the honest version of a schema
 * listing: it shows what leaves, not what exists.
 */
export interface DeliverableField {
  field: string
  label: string
  privacyClass: string
  delivered: boolean
  note: string
}

export function describeDeliverableFields(schemaType: string): DeliverableField[] {
  const fields = SCHEMA_FORM_FIELDS[schemaType]
  if (!fields) return []

  return fields.map((field) => {
    const classification = classifyField(schemaType, field.name)
    if (!classification) {
      return {
        field: field.name,
        label: field.label,
        privacyClass: 'unclassified',
        delivered: false,
        note: 'Not classified, so it is withheld from every release.',
      }
    }
    if (classification.privacyClass === 'identifier') {
      return {
        field: field.name,
        label: field.label,
        privacyClass: 'identifier',
        delivered: false,
        note: 'Identifies a person directly. Dropped, never delivered.',
      }
    }
    if (classification.privacyClass === 'quasi_identifier') {
      return {
        field: field.name,
        label: field.label,
        privacyClass: 'quasi_identifier',
        delivered: true,
        note: 'Delivered generalized, widened as far as reaching the cohort size requires.',
      }
    }
    return {
      field: field.name,
      label: field.label,
      privacyClass: classification.privacyClass,
      delivered: true,
      note:
        classification.privacyClass === 'sensitive'
          ? 'Delivered once the cohort is large enough.'
          : 'Delivered as recorded.',
    }
  })
}
