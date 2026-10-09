import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { isStravaActivities, parseStravaDate, readStravaActivities } from '../strava'
import { SOURCE_RECORD_ID_PATTERN } from '../../../validations/provenance'

const CSV = readFileSync(join(__dirname, '..', '..', '__tests__', 'fixtures', 'strava', 'activities.csv'), 'utf8')

describe('readStravaActivities', () => {
  it('reads each activity from the raw columns, keyed as the connector keys it', () => {
    const result = readStravaActivities(CSV)

    expect(result.provider).toBe('strava')
    expect(result.records.map((record) => [record.sourceRecordId, record.capturedAt, record.data])).toEqual([
      [
        '9100000001',
        '2026-09-14T10:47:26Z',
        {
          name: 'Riverside loop',
          sport_type: 'Run',
          start_date: '2026-09-14',
          source: 'strava',
          distance_km: 4.55,
          duration_min: 30,
          elevation_gain_m: 23.3,
          average_heartrate: 139,
          max_heartrate: 165,
          calories: 277,
          average_speed_kmh: 9.2,
        },
      ],
      [
        '9100000002',
        '2026-09-16T05:54:52Z',
        {
          name: 'Hill repeats',
          sport_type: 'Ride',
          start_date: '2026-09-16',
          source: 'strava',
          distance_km: 52.1,
          duration_min: 115,
          elevation_gain_m: 820,
          average_heartrate: 143,
          max_heartrate: 182,
          calories: 1290,
          average_speed_kmh: 27.2,
        },
      ],
      [
        '9100000003',
        '2026-09-18T10:23:12Z',
        {
          name: 'Pool',
          sport_type: 'Swim',
          start_date: '2026-09-18',
          source: 'strava',
          // The display column says "1,000"; the raw column says 1000 metres.
          distance_km: 1,
          duration_min: 28,
          average_heartrate: 145,
          max_heartrate: 158,
          calories: 217,
          average_speed_kmh: 2.1,
        },
      ],
      [
        '9100000004',
        '2026-09-19T18:05:00Z',
        {
          name: 'Evening lift',
          sport_type: 'WeightTraining',
          start_date: '2026-09-19',
          source: 'strava',
          duration_min: 40,
          calories: 180,
        },
      ],
    ])
    expect(result.skipped).toEqual({ unreadable: 1 })
    for (const record of result.records) expect(record.sourceRecordId).toMatch(SOURCE_RECORD_ID_PATTERN)
  })

  it('reads no distance when only the display column is there, rather than guess km or miles', () => {
    const csv = [
      'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Moving Time',
      '42,"Sep 14, 2026, 10:47:26 AM",Short,Run,600,2.5,590',
    ].join('\n')

    const [record] = readStravaActivities(csv).records
    expect(record.data).not.toHaveProperty('distance_km')
    expect(record.data).toMatchObject({ duration_min: 10 })
  })

  it('keeps one record for an activity listed twice', () => {
    const lines = CSV.trimEnd().split('\n')
    const twice = [...lines, lines[1]].join('\n')
    expect(readStravaActivities(twice).records.filter((record) => record.sourceRecordId === '9100000001')).toHaveLength(1)
  })

  it('knows the file by its header', () => {
    expect(isStravaActivities(CSV)).toBe(true)
    expect(isStravaActivities('\uFEFFActivity ID,Activity Date,Activity Name')).toBe(true)
    expect(isStravaActivities('Date,Description,Amount')).toBe(false)
  })
})

describe('parseStravaDate', () => {
  it('reads the display form in UTC, and the plain form', () => {
    expect(parseStravaDate('Aug 24, 2024, 10:47:26 AM')).toBe('2024-08-24T10:47:26Z')
    expect(parseStravaDate('Aug 24, 2024, 12:05:00 AM')).toBe('2024-08-24T00:05:00Z')
    expect(parseStravaDate('Aug 24, 2024, 12:05:00 PM')).toBe('2024-08-24T12:05:00Z')
    expect(parseStravaDate('2024-08-24 10:47:26')).toBe('2024-08-24T10:47:26Z')
  })

  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(parseStravaDate('Feb 31, 2026, 10:00:00 AM')).toBeNull()
    expect(parseStravaDate('Aug 24, 2024, 13:00:00 PM')).toBeNull()
    expect(parseStravaDate('24/08/2024')).toBeNull()
  })
})
