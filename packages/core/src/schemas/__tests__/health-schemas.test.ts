import { describe, expect, it } from 'vitest'
import { SCHEMA_VALIDATORS, VAULT_SCHEMA_TYPES } from '../vault-schemas'
import { SCHEMA_FORM_FIELDS } from '../form-fields'
import { isSaleRestrictedEntry } from '../../validations/marketplace'
import { classifyField, fieldsByClass } from '../../privacy/quasi-identifiers'

// LD-209: realistic records, shaped the way Apple Health and Health Connect
// report daily statistics and sleep sessions.
const REALISTIC = {
  sleep_session: {
    start: '2026-10-07T23:10:00-07:00',
    end: '2026-10-08T06:40:00-07:00',
    asleep_min: 412,
    deep_min: 64,
    rem_min: 98,
    light_min: 230,
    awake_min: 38,
    efficiency_pct: 91,
    source: 'apple_health',
  },
  vitals_daily: {
    date: '2026-10-08',
    resting_heart_rate: 58,
    heart_rate_variability_ms: 46,
    blood_oxygen_pct: 97,
    respiratory_rate: 14.5,
    body_temperature_c: 36.6,
    blood_pressure_systolic: 118,
    blood_pressure_diastolic: 76,
  },
  body_measurement: { date: '2026-10-08', weight_kg: 72.4, height_cm: 176, body_fat_pct: 18.2, waist_cm: 81 },
  nutrition_daily: {
    date: '2026-10-08',
    energy_kcal: 2150,
    protein_g: 96,
    carbohydrates_g: 240,
    fat_g: 78,
    fiber_g: 31,
    sugar_g: 52,
    sodium_mg: 2300,
    water_ml: 2100,
  },
} as const

const NEW_TYPES = Object.keys(REALISTIC) as (keyof typeof REALISTIC)[]

describe('LD-209 health schemas', () => {
  it.each(NEW_TYPES)('%s accepts a realistic record', (type) => {
    expect(SCHEMA_VALIDATORS[type].safeParse(REALISTIC[type]).success).toBe(true)
  })

  it('accepts a sleep session typed into the form, in local time', () => {
    expect(
      SCHEMA_VALIDATORS.sleep_session.safeParse({ start: '2026-10-07T23:10', end: '2026-10-08T06:40' }).success
    ).toBe(true)
  })

  it.each([
    ['sleep_session', 'ends before it starts', { start: '2026-10-08T06:40:00Z', end: '2026-10-07T23:10:00Z' }, 'end'],
    ['sleep_session', 'lasts two days', { start: '2026-10-01T22:00:00Z', end: '2026-10-03T07:00:00Z' }, 'end'],
    ['sleep_session', 'has no real start', { start: 'last night', end: '2026-10-08T06:40:00Z' }, 'start'],
    ['vitals_daily', 'has blood oxygen above 100%', { date: '2026-10-08', blood_oxygen_pct: 140 }, 'blood_oxygen_pct'],
    ['vitals_daily', 'has no reading at all', { date: '2026-10-08' }, ''],
    [
      'vitals_daily',
      'has the blood pressure numbers swapped',
      { date: '2026-10-08', blood_pressure_systolic: 70, blood_pressure_diastolic: 110 },
      'blood_pressure_systolic',
    ],
    ['body_measurement', 'has grams typed as kilograms', { date: '2026-10-08', weight_kg: 72400 }, 'weight_kg'],
    ['body_measurement', 'has a date in another format', { date: '08/10/2026', weight_kg: 72 }, 'date'],
    ['nutrition_daily', 'has a negative amount', { date: '2026-10-08', sodium_mg: -5 }, 'sodium_mg'],
    ['nutrition_daily', 'has no amount at all', { date: '2026-10-08' }, ''],
  ])('%s refuses a record that %s', (type, _why, record, path) => {
    const result = SCHEMA_VALIDATORS[type].safeParse(record)

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path)
  })

  it('files every new type under health, where it can never be sold', () => {
    for (const type of NEW_TYPES) {
      expect(VAULT_SCHEMA_TYPES[type].category).toBe('health')
      expect(isSaleRestrictedEntry({ category: 'personal', schema_type: type })).toBe(true)
    }
  })

  it('gives every field a form input and a privacy classification', () => {
    for (const type of NEW_TYPES) {
      const inputs = SCHEMA_FORM_FIELDS[type].map((field) => field.name)
      for (const field of Object.keys(REALISTIC[type]).filter((name) => name !== 'source')) {
        expect(inputs).toContain(field)
        expect(classifyField(type, field)).not.toBeNull()
      }
      // A health measurement is what a buyer would pay for, so it is sensitive.
      expect(fieldsByClass(type, 'sensitive').length).toBeGreaterThan(0)
    }
  })

  it('offers no type for reproductive or menstrual data', () => {
    // Open decision 12: a schema type is readable by the server, so a dedicated
    // type would itself disclose what the encrypted entry holds.
    const types = Object.keys(VAULT_SCHEMA_TYPES).join(' ')
    expect(types).not.toMatch(/menstru|cycle|ovulat|fertil|pregnan|reproduct/i)
  })
})
