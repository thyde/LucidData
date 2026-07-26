import { describe, it, expect } from 'vitest'
import {
  FIELD_CLASSIFICATIONS,
  classifyField,
  classifiedSchemaTypes,
  fieldsByClass,
  isReleasable,
} from '@/lib/privacy/quasi-identifiers'
import { SCHEMA_VALIDATORS } from '@/lib/schemas/vault-schemas'
import { z } from 'zod'

/**
 * LD-501: "every schema field has a documented privacy classification" is only
 * true if something checks it. This derives the field list from the Zod schemas
 * so adding a field without classifying it fails the build.
 */

function fieldsOf(schema: z.ZodSchema): string[] {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape
  return shape ? Object.keys(shape).sort() : []
}

describe('classification coverage', () => {
  it('classifies every field of every built-in schema', () => {
    for (const [schemaType, validator] of Object.entries(SCHEMA_VALIDATORS)) {
      const declared = fieldsOf(validator)
      expect(declared.length, `${schemaType} has no fields to check`).toBeGreaterThan(0)
      const missing = declared.filter((field) => !classifyField(schemaType, field))
      expect(
        missing,
        `Classify these ${schemaType} fields in lib/privacy/quasi-identifiers.ts: ${missing.join(', ')}`
      ).toEqual([])
    }
  })

  it('does not classify fields that no longer exist', () => {
    for (const [schemaType, classification] of Object.entries(FIELD_CLASSIFICATIONS)) {
      const validator = SCHEMA_VALIDATORS[schemaType]
      if (!validator) continue
      const declared = new Set(fieldsOf(validator))
      const stale = Object.keys(classification).filter((field) => !declared.has(field))
      expect(stale, `${schemaType} classifies fields that are gone: ${stale.join(', ')}`).toEqual([])
    }
  })

  it('gives every classification a reason a reviewer can argue with', () => {
    for (const [schemaType, classification] of Object.entries(FIELD_CLASSIFICATIONS)) {
      for (const [field, entry] of Object.entries(classification)) {
        expect(entry.reason.length, `${schemaType}.${field} needs a reason`).toBeGreaterThan(15)
      }
    }
  })

  it('gives every quasi-identifier a generalization ladder', () => {
    for (const [schemaType, classification] of Object.entries(FIELD_CLASSIFICATIONS)) {
      for (const [field, entry] of Object.entries(classification)) {
        if (entry.privacyClass !== 'quasi_identifier') continue
        expect(entry.generalization, `${schemaType}.${field} cannot be widened`).toBeTruthy()
      }
    }
  })
})

describe('failing closed', () => {
  it('refuses to release a field it has never seen', () => {
    expect(classifyField('medical_basic', 'secret_note')).toBeNull()
    expect(isReleasable('medical_basic', 'secret_note')).toBe(false)
  })

  it('refuses to release anything from a custom schema', () => {
    // Custom entries have no declared shape, so nothing in them is classified.
    expect(classifiedSchemaTypes()).not.toContain('custom')
    expect(isReleasable('custom', 'anything')).toBe(false)
  })

  it('never releases a direct identifier', () => {
    expect(isReleasable('medical_basic', 'full_name')).toBe(false)
    expect(isReleasable('identity', 'id_number_last4')).toBe(false)
    expect(isReleasable('fitness_activity', 'name')).toBe(false)
  })

  it('treats free text as an identifier, because it cannot be checked for names', () => {
    expect(classifyField('financial_summary', 'notes')?.privacyClass).toBe('identifier')
    expect(classifyField('education', 'honors')?.privacyClass).toBe('identifier')
  })
})

describe('the classification a reviewer would expect', () => {
  it('treats a birth date as a quasi-identifier, not a safe attribute', () => {
    expect(classifyField('medical_basic', 'date_of_birth')?.privacyClass).toBe(
      'quasi_identifier'
    )
    expect(classifyField('identity', 'date_of_birth')?.privacyClass).toBe('quasi_identifier')
  })

  it('treats health values as sensitive rather than safe', () => {
    expect(fieldsByClass('medical_basic', 'sensitive')).toEqual([
      'allergies',
      'conditions',
      'medications',
    ])
  })

  it('treats employer and role together as identifying', () => {
    expect(classifyField('employment', 'employer')?.privacyClass).toBe('quasi_identifier')
    expect(classifyField('employment', 'role')?.privacyClass).toBe('quasi_identifier')
  })
})
