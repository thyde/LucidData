import { describe, it, expect } from 'vitest'
import {
  looksLikeContent,
  parseProvenance,
  provenanceSchema,
  SOURCE_PROVIDER_PATTERN,
  SOURCE_RECORD_ID_PATTERN,
} from '@/lib/validations/provenance'

/**
 * LD-202: provenance sits outside the encryption envelope, so the only thing
 * standing between it and a leak is the shape of what it accepts. These tests
 * exist to make that shape hard to widen by accident.
 */
describe('provenance validation', () => {
  describe('provider', () => {
    it('accepts the slugs the connectors actually use', () => {
      for (const provider of ['strava', 'fitbit', 'google-fit', 'apple_health']) {
        expect(SOURCE_PROVIDER_PATTERN.test(provider)).toBe(true)
      }
    })

    it('rejects anything that reads like a sentence', () => {
      for (const bad of ['Morning run in Shoreditch', 'Strava Activity', 'a b']) {
        expect(SOURCE_PROVIDER_PATTERN.test(bad)).toBe(false)
      }
    })

    it('rejects uppercase, so the slug cannot double as a display name', () => {
      expect(SOURCE_PROVIDER_PATTERN.test('Strava')).toBe(false)
    })

    it('caps the length', () => {
      expect(SOURCE_PROVIDER_PATTERN.test('a'.repeat(41))).toBe(false)
      expect(SOURCE_PROVIDER_PATTERN.test('a'.repeat(40))).toBe(true)
    })
  })

  describe('record identifier', () => {
    it('accepts every identifier shape a provider realistically returns', () => {
      const identifiers = [
        '1234567890',
        '01JB6MWQ7Z2ND3E5Q6R8',
        'd3b07384-d9a0-4c9b-8f1e-2a1b3c4d5e6f',
        '2026-07-26T10:15:00.000Z-3',
        'user@example',
        'aGVsbG8gd29ybGQ=',
        'urn:strava:activity:99',
      ]
      for (const id of identifiers) {
        expect(SOURCE_RECORD_ID_PATTERN.test(id)).toBe(true)
      }
    })

    it('rejects content-bearing values', () => {
      const content = [
        'Morning run with Sam',
        "Dad's cardiology appointment",
        'Blood pressure 140/90',
        'note: felt dizzy after',
        'Weight, 82kg',
        'Was it the new medication?',
      ]
      for (const value of content) {
        expect(SOURCE_RECORD_ID_PATTERN.test(value)).toBe(false)
        expect(looksLikeContent(value)).toBe(true)
      }
    })

    it('rejects a value long enough to hide a paragraph', () => {
      expect(SOURCE_RECORD_ID_PATTERN.test('a'.repeat(129))).toBe(false)
    })

    it('rejects an empty identifier', () => {
      expect(SOURCE_RECORD_ID_PATTERN.test('')).toBe(false)
    })
  })

  describe('parseProvenance', () => {
    it('returns the normalized subset', () => {
      const result = parseProvenance({
        source_provider: 'strava',
        source_record_id: '99',
        source_captured_at: '2026-07-26T10:00:00.000Z',
      })
      expect(result).toEqual({
        source_provider: 'strava',
        source_record_id: '99',
        source_captured_at: '2026-07-26T10:00:00.000Z',
      })
    })

    it('treats no provenance as valid, because most entries are typed by hand', () => {
      expect(parseProvenance(undefined)).toEqual({})
      expect(parseProvenance({})).toEqual({})
    })

    it('throws when the record identifier carries content', () => {
      expect(() =>
        parseProvenance({
          source_provider: 'strava',
          source_record_id: 'Morning run with Sam',
        })
      ).toThrow()
    })

    it('throws when the provider carries content', () => {
      expect(() =>
        parseProvenance({ source_provider: 'Strava: morning activities' })
      ).toThrow()
    })

    it('refuses a record identifier with no provider to attribute it to', () => {
      expect(() => parseProvenance({ source_record_id: '99' })).toThrow()
    })

    it('refuses a capture time that is not a timestamp', () => {
      expect(() =>
        parseProvenance({ source_provider: 'strava', source_captured_at: 'yesterday' })
      ).toThrow()
    })

    it('reports why a value was refused rather than just failing', () => {
      const result = provenanceSchema.safeParse({
        source_provider: 'strava',
        source_record_id: 'Morning run',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cannot carry record content')
      }
    })
  })

  describe('looksLikeContent', () => {
    it('passes opaque identifiers through', () => {
      expect(looksLikeContent('1234567890')).toBe(false)
      expect(looksLikeContent('urn:strava:activity:99')).toBe(false)
    })
  })
})
