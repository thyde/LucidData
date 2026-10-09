import { Blob as NodeBlob } from 'buffer'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { readHealthExport } from '..'
import { garminSport, readGarmin } from '../garmin'
import { SOURCE_RECORD_ID_PATTERN } from '../../../validations/provenance'

const FIXTURE = join(__dirname, '..', '..', '__tests__', 'fixtures', 'garmin', 'garmin-export.zip')
// jsdom's Blob has no arrayBuffer() or stream(), which every browser's has, so the tests use Node's.
const archive = () => new NodeBlob([readFileSync(FIXTURE)]) as unknown as Blob

describe('reading a Garmin export', () => {
  it('reads workouts, days, and nights from the archive, in the units Garmin uses', async () => {
    const result = await readHealthExport(archive())

    expect(result).toMatchObject({ provider: 'garmin', label: 'Garmin', skipped: {}, unfinishedDay: '2026-09-16' })
    const byType = (type: string) => result!.records.filter((record) => record.schemaType === type)

    expect(byType('fitness_activity').map((record) => [record.sourceRecordId, record.data])).toEqual([
      [
        '21000000001',
        {
          name: 'Morning run',
          sport_type: 'Run',
          start_date: '2026-09-14T06:30:00Z',
          // Moving time, not elapsed; centimetres to kilometres; kilojoules to kilocalories.
          duration_min: 30,
          distance_km: 5.2,
          elevation_gain_m: 45,
          average_heartrate: 148,
          max_heartrate: 171,
          calories: 400,
          source: 'Garmin',
        },
      ],
      [
        '21000000002',
        {
          name: 'Commute',
          sport_type: 'Ride',
          start_date: '2026-09-15T16:10:00Z',
          duration_min: 40,
          distance_km: 12.5,
          average_heartrate: 130,
          max_heartrate: 155,
          calories: 300,
          source: 'Garmin',
        },
      ],
      [
        '21000000003',
        {
          name: 'Gym',
          sport_type: 'WeightTraining',
          start_date: '2026-09-16T18:00:00Z',
          duration_min: 45,
          calories: 200,
          source: 'Garmin',
        },
      ],
    ])

    // The last day was not over when the export was made, so it waits for a later one.
    expect(byType('fitness_daily').map((record) => record.data)).toEqual([
      { date: '2026-09-14', steps: 11234, distance_km: 8.45, calories_out: 612, active_minutes: 35, source: 'Garmin' },
      { date: '2026-09-15', steps: 9876, distance_km: 7.12, calories_out: 540, active_minutes: 30, source: 'Garmin' },
    ])
    expect(byType('vitals_daily').map((record) => record.data)).toEqual([
      { date: '2026-09-14', resting_heart_rate: 54, blood_oxygen_pct: 96, source: 'Garmin' },
      { date: '2026-09-15', resting_heart_rate: 55, blood_oxygen_pct: 95, source: 'Garmin' },
    ])

    expect(byType('sleep_session').map((record) => [record.sourceRecordId, record.data])).toEqual([
      [
        'sleep_session:2026-09-14T02:40:00Z',
        {
          start: '2026-09-14T02:40:00Z',
          end: '2026-09-14T10:10:00Z',
          asleep_min: 410,
          awake_min: 40,
          light_min: 250,
          deep_min: 60,
          rem_min: 100,
          efficiency_pct: 91.1,
          source: 'Garmin',
        },
      ],
      [
        // Some exports write the window as epoch milliseconds.
        'sleep_session:2026-09-15T03:00:00Z',
        {
          start: '2026-09-15T03:00:00Z',
          end: '2026-09-15T10:30:00Z',
          asleep_min: 400,
          awake_min: 30,
          light_min: 240,
          deep_min: 70,
          rem_min: 90,
          efficiency_pct: 88.9,
          source: 'Garmin',
        },
      ],
    ])
    for (const record of result!.records) expect(record.sourceRecordId).toMatch(SOURCE_RECORD_ID_PATTERN)
  })

  it('keeps an earlier short day, such as the one a clock change shortens', () => {
    const day = (date: string, covered: number) => ({ calendarDate: date, durationInMilliseconds: covered, totalSteps: 5000 })
    const result = readGarmin({
      activities: [],
      days: [JSON.stringify([day('2027-03-14', 23 * 3600 * 1000), day('2027-03-15', 24 * 3600 * 1000)])],
      sleep: [],
    })
    expect(result.records.map((record) => record.data.date)).toEqual(['2027-03-14', '2027-03-15'])
    expect(result.unfinishedDay).toBeUndefined()
  })

  it('counts what it could not read instead of guessing', () => {
    const result = readGarmin({
      activities: [JSON.stringify([{ summarizedActivitiesExport: [{ name: 'No id' }, { activityId: 7, beginTimestamp: 'soon' }] }])],
      days: ['not json'],
      sleep: [JSON.stringify([{ sleepStartTimestampGMT: '2026-09-14T02:40:00.0', sleepEndTimestampGMT: '2026-09-14T02:00:00.0' }])],
    })
    expect(result.records).toEqual([])
    expect(result.skipped).toEqual({ unreadable: 4 })
  })

  it('maps Garmin activity types onto the schema sports', () => {
    expect(['trail_running', 'treadmill_running', 'mountain_biking', 'indoor_cycling', 'lap_swimming', 'hiking', 'walking', 'yoga', 'golf'].map(garminSport)).toEqual(
      ['Run', 'Run', 'Ride', 'Ride', 'Swim', 'Hike', 'Walk', 'Yoga', 'Other']
    )
  })
})
