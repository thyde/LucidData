import { describe, expect, it } from 'vitest'
import { summarizeSchemaErrors, validateSchemaData } from '../validate'

describe('validateSchemaData', () => {
  it('accepts a valid record and hands nothing back to save in its place', () => {
    // Saving a parsed copy would add the schema's defaults, such as an empty
    // allergy list here, or a past job marked current.
    expect(
      validateSchemaData('medical_basic', {
        full_name: 'Sam Rivera',
        date_of_birth: '1990-04-01',
        blood_type: 'O+',
      })
    ).toEqual({ success: true })
    expect(
      validateSchemaData('employment', {
        employer: 'Synthetic Works',
        role: 'Engineer',
        employment_type: 'full_time',
        start_date: '2018-01-01',
        end_date: '2020-06-30',
      })
    ).toEqual({ success: true })
  })

  it('accepts fields the schema does not name', () => {
    expect(
      validateSchemaData('fitness_activity', {
        name: 'Run',
        sport_type: 'Run',
        start_date: '2026-10-01',
        notes: 'felt great',
      })
    ).toEqual({ success: true })
  })

  it('says, field by field, what to fix', () => {
    const result = validateSchemaData('vitals_daily', {
      date: '2026-10-08',
      blood_oxygen_pct: 140,
      resting_heart_rate: 5,
    })

    expect(result).toEqual({
      success: false,
      fieldErrors: { blood_oxygen_pct: 'Enter 100 or less', resting_heart_rate: 'Enter 20 or more' },
      formError: null,
    })
  })

  it('reports a missing required field as required, not as a type error', () => {
    const result = validateSchemaData('identity', { full_name: '', date_of_birth: '1990-04-01' })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.fieldErrors.full_name).toBe('This is required')
    expect(result.fieldErrors.nationality).toBe('This is required')
    expect(result.fieldErrors.id_type).toBe('Choose one of the options')
  })

  it('reports an emptied date as required rather than as a bad format', () => {
    const result = validateSchemaData('body_measurement', { date: '', weight_kg: 70 })

    expect(result).toEqual({ success: false, fieldErrors: { date: 'This is required' }, formError: null })
  })

  it('treats a null as a field left out', () => {
    // What the extension saves for a tracker summary that saw no third-party
    // collector.
    expect(
      validateSchemaData('browsing_insight', {
        period_start: '2026-09-01',
        period_end: '2026-10-08',
        sites_visited: 3,
        collectors_seen: 0,
        top_collector: null,
        top_collector_reach: null,
        source: 'lucid-extension',
      })
    ).toEqual({ success: true })

    const result = validateSchemaData('identity', {
      full_name: null,
      date_of_birth: '1990-04-01',
      nationality: 'Synthetic',
      id_type: 'passport',
    })
    expect(result).toEqual({ success: false, fieldErrors: { full_name: 'This is required' }, formError: null })
  })

  it('does not call an optional field required when its value has the wrong type', () => {
    const result = validateSchemaData('vitals_daily', {
      date: '2026-10-08',
      resting_heart_rate: '',
      blood_oxygen_pct: 97,
    })

    expect(result).toEqual({
      success: false,
      fieldErrors: { resting_heart_rate: 'Enter a number' },
      formError: null,
    })
  })

  it('keeps a whole-record problem apart from the fields', () => {
    const result = validateSchemaData('nutrition_daily', { date: '2026-10-08' })

    expect(result).toEqual({ success: false, fieldErrors: {}, formError: 'Enter at least one amount' })
  })

  it('explains data that is not an object', () => {
    for (const data of [[], 'weight', null]) {
      expect(validateSchemaData('body_measurement', data)).toEqual({
        success: false,
        fieldErrors: {},
        formError: 'Enter the data as a JSON object',
      })
    }
  })

  it('uses the message a refinement wrote for its field', () => {
    const result = validateSchemaData('sleep_session', {
      start: '2026-10-08T07:00',
      end: '2026-10-08T06:00',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.fieldErrors.end).toBe('The end must be after the start')
  })

  it('accepts anything for a custom entry, which has no schema', () => {
    expect(validateSchemaData('custom', { anything: true })).toEqual({ success: true })
  })

  it('summarizes the problems for a single JSON editor', () => {
    expect(
      summarizeSchemaErrors({ fieldErrors: { weight_kg: 'Enter 700 or less' }, formError: null })
    ).toBe('weight_kg: Enter 700 or less')
    expect(
      summarizeSchemaErrors({ fieldErrors: {}, formError: 'Enter at least one measurement' })
    ).toBe('Enter at least one measurement')
  })

  it('names fields by label when labels are given', () => {
    expect(
      summarizeSchemaErrors(
        { fieldErrors: { weight_kg: 'Enter 700 or less', bmi: 'Enter 5 or more' }, formError: null },
        { weight_kg: 'Weight (kg)' }
      )
    ).toBe('Weight (kg): Enter 700 or less. bmi: Enter 5 or more')
  })
})
