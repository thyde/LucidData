import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { isStravaActivities, parseStravaDate, readStravaActivities } from '../strava'
import { SOURCE_RECORD_ID_PATTERN } from '../../../validations/provenance'

const CSV = readFileSync(join(__dirname, '..', '..', '__tests__', 'fixtures', 'strava', 'activities.csv'), 'utf8')

describe('readStravaActivities', () => {
  it('reads each activity from the raw columns, keyed as the connector keys it', () => {
    const result = readStravaActivities(CSV)

    // The archive's own provider, so disconnecting Strava never deletes it.
    expect(result.provider).toBe('strava-archive')
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

  it('reads a header in another language by its layout, and says when the dates are not readable', () => {
    // The French header, with the names repeated where the English ones are.
    const header = CSV.split('\n')[0]
      .split(',')
      .map((name) =>
        ({
          'Activity ID': "ID de l'activité",
          'Activity Date': "Date de l'activité",
          'Activity Name': "Nom de l'activité",
          'Activity Type': "Type d'activité",
          'Elapsed Time': 'Temps écoulé',
          Distance: 'Distance',
          'Max Heart Rate': 'Fréquence cardiaque max.',
        })[name] ?? name
      )
      .map((name) => (name.includes("'") || name.includes(',') ? `"${name}"` : name))
      .join(',')
    // Without the fixture's deliberately unreadable row: a translated archive
    // with any date that cannot be read imports nothing, as shown below.
    const rows = CSV.trimEnd()
      .split('\n')
      .slice(1)
      .filter((line) => !line.startsWith('9100000005'))
    const french = [header, ...rows].join('\n')
    expect(isStravaActivities(french)).toBe(true)
    expect(readStravaActivities(french).records.map((record) => record.sourceRecordId)).toEqual([
      '9100000001',
      '9100000002',
      '9100000003',
      '9100000004',
    ])

    // French dates cannot be read yet, and the person is told what to do.
    const frenchDates = french.replace('"Sep 14, 2026, 10:47:26 AM"', '"14 sept. 2026, 10:47:26"')
      .replace('"Sep 16, 2026, 5:54:52 AM"', '"16 sept. 2026, 05:54:52"')
      .replace('"Sep 18, 2026, 10:23:12 AM"', '"18 sept. 2026, 10:23:12"')
      .replace('"Sep 19, 2026, 6:05:00 PM"', '"19 sept. 2026, 18:05:00"')
    const unreadable = readStravaActivities(frenchDates)
    expect(unreadable.records).toEqual([])
    expect(unreadable.hint).toMatch(/language LucidData cannot read yet\. Set Strava to English \(US\)/)

    // Some months of another language can look English. Importing those and
    // dropping the rest would leave holes nobody is told about, so a
    // translated archive with any unreadable date imports nothing.
    const mixed = french.replace('"Sep 16, 2026, 5:54:52 AM"', '"16 okt 2026, 05:54:52"')
    const partial = readStravaActivities(mixed)
    expect(partial.records).toEqual([])
    expect(partial.skipped).toEqual({ unreadable: 4 })
    expect(partial.hint).toMatch(/language LucidData cannot read yet/)
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

  it('reads the day-first form on either clock, with British English Sept', () => {
    expect(parseStravaDate('24 Aug 2024, 10:47:26')).toBe('2024-08-24T10:47:26Z')
    expect(parseStravaDate('24 Aug 2024, 22:47:26')).toBe('2024-08-24T22:47:26Z')
    expect(parseStravaDate('24 Aug 2024, 10:47:26 pm')).toBe('2024-08-24T22:47:26Z')
    expect(parseStravaDate('4 Sept 2024, 10:47:26')).toBe('2024-09-04T10:47:26Z')
    expect(parseStravaDate('4 Sept 2024, 10:47:26 pm')).toBe('2024-09-04T22:47:26Z')
  })

  it('takes the narrow space newer locale data puts before AM and PM', () => {
    expect(parseStravaDate('Aug 24, 2024, 10:47:26\u202fAM')).toBe('2024-08-24T10:47:26Z')
  })

  it('reads month names only as English writes them', () => {
    // Dutch and Spanish abbreviations, some of which look English in lower case.
    expect(parseStravaDate('24 aug 2024, 10:47:26')).toBeNull()
    expect(parseStravaDate('24 sep 2024, 10:47:26')).toBeNull()
    expect(parseStravaDate('24 Sepx 2024, 10:47:26')).toBeNull()
  })

  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(parseStravaDate('Feb 31, 2026, 10:00:00 AM')).toBeNull()
    expect(parseStravaDate('Aug 24, 2024, 13:00:00 PM')).toBeNull()
    expect(parseStravaDate('24/08/2024')).toBeNull()
    expect(parseStravaDate('31 Feb 2026, 10:00:00')).toBeNull()
    expect(parseStravaDate('24 Aug 2024, 24:00:00')).toBeNull()
  })

  it('says what to do when an English archive has dates it cannot read', () => {
    const odd = CSV.replace('"Sep 14, 2026, 10:47:26 AM"', '"2026.09.14 10:47"')
      .replace('"Sep 16, 2026, 5:54:52 AM"', '"2026.09.16 05:54"')
      .replace('"Sep 18, 2026, 10:23:12 AM"', '"2026.09.18 10:23"')
      .replace('"Sep 19, 2026, 6:05:00 PM"', '"2026.09.19 18:05"')
    const result = readStravaActivities(odd)
    expect(result.records).toEqual([])
    expect(result.hint).toMatch(/could not read the dates/)
    // One readable row is enough to say nothing.
    expect(readStravaActivities(CSV).hint).toBeUndefined()
  })
})
