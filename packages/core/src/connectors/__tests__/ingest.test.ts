import { describe, expect, it } from 'vitest'
import { entryFromIngested, type PendingIngestRecord } from '../ingest'
import { normalizeStravaActivity } from '../fitness'

const queued: PendingIngestRecord = {
  category: 'health',
  schema_type: 'fitness_activity',
  provider: 'strava',
  provider_record_id: '111',
  captured_at: '2026-10-01T07:00:00Z',
}

const NAME = 'Run to Golden Gate Park with Sam'

describe('entryFromIngested', () => {
  it('keeps the provider name for the record out of everything readable', () => {
    const payload = normalizeStravaActivity({
      name: NAME,
      sport_type: 'Run',
      start_date: '2026-10-01T07:00:00Z',
      distance: 5000,
    })
    const { data, ...readable } = entryFromIngested(queued, JSON.stringify({ __label: NAME, ...payload }))

    expect(readable.label).toBe('Workout')
    expect(JSON.stringify(readable)).not.toContain('Golden Gate')
    expect(data.name).toBe(NAME)
    expect(data).not.toHaveProperty('__label')
  })

  it('moves a sealed name into the data when the record has none of its own', () => {
    const entry = entryFromIngested(
      { ...queued, schema_type: 'fitness_daily' },
      JSON.stringify({ __label: 'Tuesday', date: '2026-10-01', steps: 9000 })
    )

    expect(entry.label).toBe('Daily activity')
    expect(entry.data).toEqual({ date: '2026-10-01', steps: 9000, name: 'Tuesday' })
  })

  it('carries the provenance identifiers', () => {
    const entry = entryFromIngested(queued, JSON.stringify({ name: 'Run', sport_type: 'Run', start_date: '2026-10-01' }))

    expect(entry).toMatchObject({
      category: 'health',
      schema_type: 'fitness_activity',
      source_provider: 'strava',
      source_record_id: '111',
      source_captured_at: '2026-10-01T07:00:00Z',
    })
  })

  it('leaves out provenance the queue does not have', () => {
    const entry = entryFromIngested(
      { ...queued, provider: null, provider_record_id: null, captured_at: null },
      JSON.stringify({ date: '2026-10-01', steps: 1 })
    )

    expect(entry).not.toHaveProperty('source_provider')
    expect(entry).not.toHaveProperty('source_record_id')
    expect(entry).not.toHaveProperty('source_captured_at')
  })

  it('refuses a record that does not open to an object', () => {
    expect(() => entryFromIngested(queued, '[1]')).toThrow('did not open to an object')
    expect(() => entryFromIngested(queued, 'null')).toThrow('did not open to an object')
  })
})
