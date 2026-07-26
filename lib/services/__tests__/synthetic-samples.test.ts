import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  SYNTHETIC_NOTICE,
  buildSyntheticSamples,
  describeDeliverableFields,
} from '@/lib/services/synthetic-samples'
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'
import { classifyField } from '@/lib/privacy/quasi-identifiers'

/**
 * LD-503: samples must be synthetic. A preview drawn from real records leaks,
 * and a small pool leaks hardest.
 */

describe('the sample generator cannot reach real data', () => {
  it('imports nothing that could read a contribution', () => {
    // The strongest form of "never touches contribution rows" is that the
    // module has no way to reach them. Asserted on the source, so adding a
    // repository import later fails this test.
    const source = readFileSync(
      join(process.cwd(), 'lib', 'services', 'synthetic-samples.ts'),
      'utf8'
    )
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])
    for (const specifier of imports) {
      expect(specifier).not.toContain('repositories')
      expect(specifier).not.toContain('supabase')
      expect(specifier).not.toContain('.service')
    }
  })

  it('produces the same values on every call, so variation cannot be mistaken for real data', () => {
    const first = buildSyntheticSamples('employment')
    const second = buildSyntheticSamples('employment')
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('labels every sample synthetic', () => {
    for (const sample of buildSyntheticSamples('education')) {
      expect(sample.synthetic).toBe(true)
    }
    expect(SYNTHETIC_NOTICE.toLowerCase()).toContain('invented')
  })
})

describe('samples show what a release would actually deliver', () => {
  it('never includes a direct identifier', () => {
    for (const schemaType of Object.keys(SCHEMA_FORM_FIELDS)) {
      for (const sample of buildSyntheticSamples(schemaType)) {
        for (const field of Object.keys(sample.values)) {
          expect(
            classifyField(schemaType, field)?.privacyClass,
            `${schemaType}.${field} is an identifier and must not appear in a preview`
          ).not.toBe('identifier')
        }
      }
    }
  })

  it('never includes an unclassified field', () => {
    const samples = buildSyntheticSamples('employment')
    for (const field of Object.keys(samples[0].values)) {
      expect(classifyField('employment', field)).not.toBeNull()
    }
  })

  it('applies the generalization levels a release would apply', () => {
    const exact = buildSyntheticSamples('employment', { generalizationLevels: {} })
    const widened = buildSyntheticSamples('employment', {
      generalizationLevels: { start_date: 4, employer: 1 },
    })
    // A decade rather than a date, and the employer suppressed entirely.
    expect(String(widened[0].values.start_date)).toMatch(/^\d{4}s$/)
    expect(widened[0].values).not.toHaveProperty('employer')
    expect(exact[0].values).toHaveProperty('employer')
  })

  it('returns nothing for a schema it does not know', () => {
    expect(buildSyntheticSamples('custom')).toEqual([])
    expect(buildSyntheticSamples('not_a_schema')).toEqual([])
  })

  it('caps how many samples it will produce', () => {
    expect(buildSyntheticSamples('employment', { count: 500 })).toHaveLength(10)
    expect(buildSyntheticSamples('employment', { count: 0 })).toHaveLength(1)
  })
})

describe('describeDeliverableFields', () => {
  it('marks identifiers and unclassified fields as withheld, with a reason', () => {
    const fields = describeDeliverableFields('medical_basic')
    const name = fields.find((entry) => entry.field === 'full_name')
    expect(name?.delivered).toBe(false)
    expect(name?.note.toLowerCase()).toContain('identifies a person')
  })

  it('marks quasi-identifiers as delivered but generalized', () => {
    const fields = describeDeliverableFields('identity')
    const dob = fields.find((entry) => entry.field === 'date_of_birth')
    expect(dob?.delivered).toBe(true)
    expect(dob?.note.toLowerCase()).toContain('generalized')
  })

  it('covers every field of the schema, so nothing is silently omitted', () => {
    for (const [schemaType, formFields] of Object.entries(SCHEMA_FORM_FIELDS)) {
      const described = describeDeliverableFields(schemaType).map((entry) => entry.field)
      expect(described.sort()).toEqual(formFields.map((field) => field.name).sort())
    }
  })
})
