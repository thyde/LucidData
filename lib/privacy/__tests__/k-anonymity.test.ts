import { describe, it, expect } from 'vitest'
import {
  DEFAULT_K,
  MAX_SUPPRESSION_RATE,
  PrivacyGateError,
  achievedK,
  equivalenceClasses,
  generalizeValue,
  maxLevel,
  prepareRelease,
  rungLabel,
  type ReleaseRecord,
} from '@/lib/privacy/k-anonymity'

describe('generalization ladders', () => {
  it('widens a date one rung at a time', () => {
    const date = '1987-04-15'
    expect(generalizeValue('date', date, 0)).toBe('1987-04-15')
    expect(generalizeValue('date', date, 1)).toBe('1987-04')
    expect(generalizeValue('date', date, 2)).toBe('1987-Q2')
    expect(generalizeValue('date', date, 3)).toBe('1987')
    expect(generalizeValue('date', date, 4)).toBe('1980s')
    expect(generalizeValue('date', date, 5)).toBeNull()
  })

  it('widens a year into bands', () => {
    expect(generalizeValue('year', 2013, 0)).toBe(2013)
    expect(generalizeValue('year', 2013, 1)).toBe('2010-2014')
    expect(generalizeValue('year', 2013, 2)).toBe('2010-2019')
    expect(generalizeValue('year', 2013, 3)).toBe('2000-2024')
    expect(generalizeValue('year', 2013, 4)).toBeNull()
  })

  it('widens a number by powers of its step', () => {
    expect(generalizeValue('numeric', 1234, 0, 10)).toBe(1234)
    expect(generalizeValue('numeric', 1234, 1, 10)).toBe('1230-1240')
    expect(generalizeValue('numeric', 1234, 2, 10)).toBe('1200-1300')
    expect(generalizeValue('numeric', 1234, 3, 10)).toBe('1000-2000')
    expect(generalizeValue('numeric', 1234, 4, 10)).toBeNull()
  })

  it('can only suppress a category, because inventing a hierarchy is a guess', () => {
    expect(generalizeValue('categorical', 'Acme Ltd', 0)).toBe('Acme Ltd')
    expect(generalizeValue('categorical', 'Acme Ltd', 1)).toBeNull()
    expect(maxLevel('categorical')).toBe(1)
  })

  it('generalizes an unparseable value to null rather than throwing mid-release', () => {
    expect(generalizeValue('date', 'not a date', 0)).toBeNull()
    expect(generalizeValue('year', 'abc', 0)).toBeNull()
    expect(generalizeValue('numeric', undefined, 0)).toBeNull()
  })

  it('labels every rung it can reach', () => {
    expect(rungLabel('date', 0)).toBe('exact day')
    expect(rungLabel('date', 4)).toBe('decade')
    // Out of range clamps rather than returning undefined.
    expect(rungLabel('date', 99)).toBe('suppressed')
  })
})

describe('equivalence classes', () => {
  const records: ReleaseRecord[] = [
    { id: 'a', schemaType: 'identity', payload: { date_of_birth: '1990-01-01', nationality: 'GB' } },
    { id: 'b', schemaType: 'identity', payload: { date_of_birth: '1990-01-01', nationality: 'GB' } },
    { id: 'c', schemaType: 'identity', payload: { date_of_birth: '1990-06-01', nationality: 'GB' } },
  ]

  it('groups records that share their quasi-identifier values', () => {
    const classes = equivalenceClasses(records, ['date_of_birth', 'nationality'], {
      date_of_birth: 0,
      nationality: 0,
    })
    expect(classes).toHaveLength(2)
    expect(achievedK(classes)).toBe(1)
  })

  it('merges classes as the ladder widens', () => {
    const classes = equivalenceClasses(records, ['date_of_birth', 'nationality'], {
      date_of_birth: 3,
      nationality: 0,
    })
    expect(classes).toHaveLength(1)
    expect(achievedK(classes)).toBe(3)
  })

  it('returns zero k for an empty set rather than Infinity', () => {
    expect(achievedK([])).toBe(0)
  })
})

/**
 * The case the whole spec exists for: enough contributors to satisfy a count,
 * but quasi-identifiers that single people out.
 */
describe('a dataset where a naive count passes but k-anonymity fails', () => {
  // Fifty contributors. Forty-five share a birth year and nationality; five are
  // each unique on birth date and employer country.
  const cohort: ReleaseRecord[] = [
    ...Array.from({ length: 45 }, (_, index) => ({
      id: `common-${index}`,
      schemaType: 'identity',
      payload: {
        full_name: `Person ${index}`,
        date_of_birth: '1990-03-14',
        nationality: 'GB',
        issuing_country: 'GB',
        id_type: 'passport',
      },
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `rare-${index}`,
      schemaType: 'identity',
      payload: {
        full_name: `Rare ${index}`,
        date_of_birth: `19${60 + index * 7}-0${index + 1}-0${index + 1}`,
        nationality: ['IS', 'MT', 'LU', 'BN', 'FJ'][index],
        issuing_country: ['IS', 'MT', 'LU', 'BN', 'FJ'][index],
        id_type: 'passport',
      },
    })),
  ]

  it('passes a bare contributor count of 50', () => {
    expect(new Set(cohort.map((record) => record.id)).size).toBe(50)
  })

  it('suppresses the five people a count would have released', () => {
    const result = prepareRelease(cohort, { k: DEFAULT_K })
    expect(result.report.recordsIn).toBe(50)
    expect(result.report.recordsReleased).toBe(45)
    expect(result.report.recordsSuppressed).toBe(5)
    expect(result.report.k).toBeGreaterThanOrEqual(DEFAULT_K)
  })

  it('never lets a name into the release', () => {
    const result = prepareRelease(cohort, { k: DEFAULT_K })
    for (const record of result.records) {
      expect(record.payload).not.toHaveProperty('full_name')
    }
    expect(result.report.identifiersDropped).toContain('full_name')
  })

  it('refuses when reaching k would leave nothing to release', () => {
    // Twenty people, each unique on every quasi-identifier, and no other
    // fields. The ladder can reach k only by suppressing everything.
    const allUnique: ReleaseRecord[] = Array.from({ length: 20 }, (_, index) => ({
      id: `u-${index}`,
      schemaType: 'identity',
      payload: {
        date_of_birth: `19${50 + index}-0${(index % 9) + 1}-1${index % 9}`,
        nationality: `C${index}`,
        issuing_country: `C${index}`,
      },
    }))
    expect(() => prepareRelease(allUnique, { k: DEFAULT_K })).toThrow(PrivacyGateError)
  })

  it('strips the quasi-identifiers rather than the payload when both are present', () => {
    const withPayload: ReleaseRecord[] = Array.from({ length: 20 }, (_, index) => ({
      id: `p-${index}`,
      schemaType: 'identity',
      payload: {
        date_of_birth: `19${50 + index}-0${(index % 9) + 1}-1${index % 9}`,
        nationality: `C${index}`,
        id_type: 'passport',
      },
    }))
    const result = prepareRelease(withPayload, { k: DEFAULT_K })
    // id_type is safe, so it survives; the identifying combination does not.
    expect(result.records[0].payload).toEqual({ id_type: 'passport' })
    expect(result.report.k).toBeGreaterThanOrEqual(DEFAULT_K)
  })

  it('tells the buyer nothing about the cohort when it refuses', () => {
    const tiny: ReleaseRecord[] = [
      { id: 'a', schemaType: 'identity', payload: { nationality: 'GB' } },
    ]
    try {
      prepareRelease(tiny, { k: DEFAULT_K })
      throw new Error('expected a refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(PrivacyGateError)
      const message = (error as PrivacyGateError).message
      // No counts, no field names, no k value.
      expect(message).not.toMatch(/\d/)
      expect(message).not.toContain('nationality')
      // The reason is available to us for telemetry, just not to the buyer.
      expect((error as PrivacyGateError).reason).toBe('fewer_records_than_k')
    }
  })
})

describe('prepareRelease', () => {
  const uniform = (count: number, overrides: Record<string, unknown> = {}): ReleaseRecord[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `r-${index}`,
      schemaType: 'employment',
      payload: {
        employer: 'Acme',
        role: 'Engineer',
        start_date: '2020-01-01',
        employment_type: 'full_time',
        is_current: true,
        salary_range: '60k-100k',
        currency: 'USD',
        ...overrides,
      },
    }))

  it('is deterministic', () => {
    const first = prepareRelease(uniform(10))
    const second = prepareRelease(uniform(10))
    expect(JSON.stringify(first.records)).toBe(JSON.stringify(second.records))
    expect(first.report.generalizations).toEqual(second.report.generalizations)
  })

  it('releases sensitive and safe fields once k is met', () => {
    const result = prepareRelease(uniform(10))
    expect(result.records[0].payload).toHaveProperty('salary_range', '60k-100k')
    expect(result.records[0].payload).toHaveProperty('employment_type', 'full_time')
  })

  it('reports the generalization level for every quasi-identifier', () => {
    const result = prepareRelease(uniform(10))
    const fields = result.report.generalizations.map((entry) => entry.field)
    expect(fields).toEqual(['currency', 'employer', 'end_date', 'role', 'start_date'].filter((f) => fields.includes(f)))
    for (const entry of result.report.generalizations) {
      expect(entry.label).toBeTruthy()
      expect(entry.level).toBeGreaterThanOrEqual(0)
    }
  })

  it('suppresses fields nobody has classified rather than passing them through', () => {
    const result = prepareRelease(uniform(10, { mystery_field: 'leak me' }))
    expect(result.report.unclassifiedSuppressed).toContain('mystery_field')
    for (const record of result.records) {
      expect(record.payload).not.toHaveProperty('mystery_field')
    }
  })

  it('refuses an empty release', () => {
    expect(() => prepareRelease([])).toThrow(PrivacyGateError)
  })

  it('refuses when there are fewer records than k', () => {
    expect(() => prepareRelease(uniform(3), { k: 5 })).toThrow(PrivacyGateError)
  })

  it('raises k below the floor rather than honouring it', () => {
    const result = prepareRelease(uniform(10), { k: 1 })
    expect(result.report.kTarget).toBeGreaterThanOrEqual(2)
  })

  it('carries the pool epsilon spend into the report', () => {
    const result = prepareRelease(uniform(10), { epsilonSpent: 1.5 })
    expect(result.report.epsilonSpent).toBe(1.5)
  })

  it('never exceeds the suppression limit it reports', () => {
    const result = prepareRelease(uniform(10))
    expect(result.report.suppressionRate).toBeLessThanOrEqual(MAX_SUPPRESSION_RATE)
  })
})
