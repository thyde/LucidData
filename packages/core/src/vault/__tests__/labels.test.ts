import { describe, expect, it } from 'vitest'
import { fitLabel, importedEntryLabel, MAX_LABEL_LENGTH, recordSummary } from '../labels'
import { labelForRecord } from '../import-parsers'

describe('importedEntryLabel', () => {
  it('names the type and nothing from inside the record', () => {
    expect(importedEntryLabel('fitness_activity')).toBe('Workout')
    expect(importedEntryLabel('sleep_session')).toBe('Sleep session')
  })

  it('falls back for a custom, unknown, or missing type', () => {
    for (const type of ['custom', 'not_a_type', undefined, null, '']) {
      expect(importedEntryLabel(type)).toBe('Imported record')
    }
  })
})

describe('fitLabel', () => {
  it('trims and cuts to the length the server accepts', () => {
    expect(fitLabel('  Morning run  ')).toBe('Morning run')
    expect(fitLabel('x'.repeat(150))).toHaveLength(MAX_LABEL_LENGTH)
  })

  it('caps a label taken from an imported record', () => {
    expect(labelForRecord({ name: 'y'.repeat(140) }, 'Imported 1')).toHaveLength(MAX_LABEL_LENGTH)
    expect(labelForRecord({}, 'Imported 1')).toBe('Imported 1')
  })
})

describe('recordSummary', () => {
  it('describes a workout by its name and day', () => {
    expect(
      recordSummary({ name: 'Run with Sam', sport_type: 'Run', start_date: '2026-01-15 08:30:00 -0800' })
    ).toBe('Run with Sam, 2026-01-15')
  })

  it('describes daily records, sleep, and tracker summaries by their day', () => {
    expect(recordSummary({ date: '2026-10-07', weight_kg: 72 })).toBe('2026-10-07')
    expect(recordSummary({ start: '2026-10-06T22:45', end: '2026-10-07T06:50' })).toBe('2026-10-06')
    expect(recordSummary({ period_start: '2026-09-01', period_end: '2026-10-08' })).toBe('2026-10-08')
  })

  it('says nothing when there is nothing to say', () => {
    expect(recordSummary({ employer: 'Synthetic Works' })).toBeNull()
    expect(recordSummary({ name: '   ', date: 'yesterday' })).toBeNull()
    expect(recordSummary(null)).toBeNull()
    expect(recordSummary(['2026-10-07'])).toBeNull()
  })
})
