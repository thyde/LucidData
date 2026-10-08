import { describe, it, expect } from 'vitest'
import {
  detectAdapter,
  parseWithAdapter,
  appleHealthAdapter,
  googleTakeoutAdapter,
  bankCsvAdapter,
} from '../index'

const APPLE_HEALTH_EXPORT = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [<!ELEMENT HealthData (Record|Workout)*>]>
<HealthData locale="en_GB">
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-01-15 08:00:00 -0800" value="1200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-01-15 18:00:00 -0800" value="3400"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-01-16 09:00:00 -0800" value="800"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-01-15 08:05:00 -0800" value="42.5"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-01-15 08:05:00 -0800" value="88"/>
</HealthData>`

const APPLE_HEALTH_WITH_WORKOUT = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.5" durationUnit="min" totalDistance="5.2" totalDistanceUnit="km" totalEnergyBurned="320" sourceName="Watch" startDate="2026-01-15 08:00:00 -0800"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="3600" durationUnit="sec" totalDistance="10" totalDistanceUnit="mi" startDate="2026-01-16 07:00:00 -0800"/>
 <Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-01-15 08:00:00 -0800" value="1200"/>
</HealthData>`

describe('Apple Health adapter', () => {
  it('recognises an export by its root element, not only its name', () => {
    expect(appleHealthAdapter.detect('renamed.xml', APPLE_HEALTH_EXPORT)).toBe(true)
    expect(appleHealthAdapter.detect('export.xml', '<rss><channel/></rss>')).toBe(false)
  })

  it('aggregates quantity samples into one record per calendar day', () => {
    // Apple writes a sample every few minutes. A day is the unit a person
    // thinks in, and one entry per sample would be tens of thousands of
    // useless vault records.
    const result = appleHealthAdapter.parse(APPLE_HEALTH_EXPORT)

    expect(result.schemaType).toBe('fitness_daily')
    expect(result.records).toHaveLength(2)
    expect(result.records[0]).toMatchObject({ date: '2026-01-15', steps: 4600 })
    expect(result.records[1]).toMatchObject({ date: '2026-01-16', steps: 800 })
  })

  it('keeps the calendar day rather than the timestamp, so a day is not split', () => {
    const result = appleHealthAdapter.parse(APPLE_HEALTH_EXPORT)
    const dates = result.records.map((r) => r.date)

    expect(dates).toEqual(['2026-01-15', '2026-01-16'])
  })

  it('ignores quantity types it has no field for', () => {
    const result = appleHealthAdapter.parse(APPLE_HEALTH_EXPORT)

    // Heart rate is present in the fixture and has no daily field, so it must
    // not appear as a stray key.
    expect(Object.keys(result.records[0])).not.toContain('HKQuantityTypeIdentifierHeartRate')
  })

  it('prefers workouts when the export has both', () => {
    const result = appleHealthAdapter.parse(APPLE_HEALTH_WITH_WORKOUT)

    expect(result.schemaType).toBe('fitness_activity')
    expect(result.records).toHaveLength(2)
  })

  it('normalizes units so a mile is not stored as a kilometre', () => {
    const result = appleHealthAdapter.parse(APPLE_HEALTH_WITH_WORKOUT)

    expect(result.records[0]).toMatchObject({
      sport_type: 'Run',
      distance_km: 5.2,
      duration_min: 32.5,
    })
    // 10 miles and 3600 seconds.
    expect(result.records[1]).toMatchObject({
      sport_type: 'Ride',
      distance_km: 16.09,
      duration_min: 60,
    })
  })

  it('maps an unknown activity type to Other rather than failing', () => {
    const xml = `<HealthData><Workout workoutActivityType="HKWorkoutActivityTypeCurling" duration="10" durationUnit="min" startDate="2026-01-15 08:00:00 -0800"/></HealthData>`

    expect(appleHealthAdapter.parse(xml).records[0]).toMatchObject({ sport_type: 'Other' })
  })

  it('decodes XML entities in attribute values', () => {
    const xml = `<HealthData><Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Bob &amp; Sons" duration="5" durationUnit="min" startDate="2026-01-15 08:00:00 -0800"/></HealthData>`

    expect(appleHealthAdapter.parse(xml).records[0]).toMatchObject({ source: 'Bob & Sons' })
  })

  it('reports nothing rather than throwing on an export with no usable records', () => {
    const result = appleHealthAdapter.parse('<HealthData locale="en_GB"></HealthData>')

    expect(result.records).toEqual([])
    expect(result.schemaType).toBeUndefined()
  })

  it('truncates a very large export instead of failing on it', () => {
    // The real reason this adapter scans rather than using DOMParser. A year of
    // Apple Health data is routinely hundreds of megabytes.
    const workouts = Array.from(
      { length: 5000 },
      (_, i) =>
        `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2026-01-15 08:00:00 -0800" id="${i}"/>`
    ).join('\n')
    const result = appleHealthAdapter.parse(`<HealthData>${workouts}</HealthData>`, { limit: 100 })

    expect(result.records).toHaveLength(100)
    expect(result.totalFound).toBe(5000)
    expect(result.truncated).toBe(true)
  })
})

describe('Google Takeout adapter', () => {
  it('unwraps a named container array', () => {
    const json = JSON.stringify({
      'Browser History': [
        { title: 'Example', time_usec: 1700000000000000 },
        { title: 'Another', time_usec: 1700000000000001 },
      ],
    })

    const result = googleTakeoutAdapter.parse(json)

    expect(result.records).toHaveLength(2)
    expect(result.records[0]).toMatchObject({ title: 'Example' })
  })

  it('accepts a bare array', () => {
    const result = googleTakeoutAdapter.parse(JSON.stringify([{ a: 1 }, { a: 2 }]))

    expect(result.records).toHaveLength(2)
  })

  it('flattens one level so nested values are mappable', () => {
    const json = JSON.stringify([{ header: 'Search', details: { name: 'From Google Ads' } }])

    const result = googleTakeoutAdapter.parse(json)

    expect(result.records[0]).toMatchObject({ header: 'Search', 'details.name': 'From Google Ads' })
  })

  it('summarises a scalar array but leaves a mixed one out', () => {
    // A stringified object array looks like data while being unusable, so it is
    // dropped rather than rendered as [object Object].
    const json = JSON.stringify([{ tags: ['a', 'b'], objects: [{ x: 1 }] }])

    const result = googleTakeoutAdapter.parse(json)

    expect(result.records[0].tags).toBe('a, b')
    expect(result.records[0]).not.toHaveProperty('objects')
  })

  it('does not guess a schema type', () => {
    // Takeout can be location history, purchases, or browsing. A wrong guess
    // maps fields silently rather than visibly.
    const result = googleTakeoutAdapter.parse(JSON.stringify([{ a: 1 }]))

    expect(result.schemaType).toBeUndefined()
  })

  it('truncates a large export and reports the true total', () => {
    const items = Array.from({ length: 5000 }, (_, i) => ({ i }))
    const result = googleTakeoutAdapter.parse(JSON.stringify(items), { limit: 250 })

    expect(result.records).toHaveLength(250)
    expect(result.totalFound).toBe(5000)
    expect(result.truncated).toBe(true)
  })

  it('throws on malformed JSON, because a file it claimed is a real failure', () => {
    expect(() => googleTakeoutAdapter.parse('{ not json')).toThrow()
  })
})

describe('bank statement adapter', () => {
  const NATWEST = `Date,Description,Amount,Balance
15/01/2026,TESCO STORES,-42.50,1200.00
16/01/2026,SALARY,2000.00,3200.00`

  const DEBIT_CREDIT = `Transaction Date,Narrative,Debit,Credit
2026-01-15,COFFEE,3.20,
2026-01-16,REFUND,,15.00`

  it('recognises a statement by its columns, not its filename', () => {
    expect(bankCsvAdapter.detect('anything.csv', NATWEST)).toBe(true)
    expect(bankCsvAdapter.detect('contacts.csv', 'Name,Email\nA,a@b.c')).toBe(false)
  })

  it('normalizes differently named columns onto one shape', () => {
    const a = bankCsvAdapter.parse(NATWEST).records[0]
    const b = bankCsvAdapter.parse(DEBIT_CREDIT).records[0]

    expect(Object.keys(a)).toEqual(expect.arrayContaining(['date', 'description', 'amount']))
    expect(Object.keys(b)).toEqual(expect.arrayContaining(['date', 'description', 'amount']))
  })

  it('treats a separate debit column as an outflow', () => {
    const records = bankCsvAdapter.parse(DEBIT_CREDIT).records

    expect(records[0]).toMatchObject({ description: 'COFFEE', amount: -3.2 })
    expect(records[1]).toMatchObject({ description: 'REFUND', amount: 15 })
  })

  it('parses accounting-style negatives', () => {
    // Number('(42.50)') is NaN, which would silently drop the transaction.
    const csv = `Date,Description,Amount\n2026-01-15,FEE,(42.50)`

    expect(bankCsvAdapter.parse(csv).records[0]).toMatchObject({ amount: -42.5 })
  })

  it('strips currency symbols and thousands separators', () => {
    const csv = `Date,Description,Amount\n2026-01-15,RENT,"$1,250.00"`

    expect(bankCsvAdapter.parse(csv).records[0]).toMatchObject({ amount: 1250 })
  })

  it('rewrites an unambiguous day-first date and leaves an ambiguous one alone', () => {
    // 15 cannot be a month, so the order is knowable. 05/06 is genuinely
    // ambiguous and guessing would move a transaction by a month.
    const unambiguous = bankCsvAdapter.parse(
      `Date,Description,Amount\n15/01/2026,A,1`
    ).records[0]
    const ambiguous = bankCsvAdapter.parse(`Date,Description,Amount\n05/06/2026,A,1`).records[0]

    expect(unambiguous.date).toBe('2026-01-15')
    expect(ambiguous.date).toBe('05/06/2026')
  })

  it('keeps columns it does not recognise', () => {
    const csv = `Date,Description,Amount,Sort Code\n2026-01-15,A,1,12-34-56`

    expect(bankCsvAdapter.parse(csv).records[0]).toMatchObject({ 'Sort Code': '12-34-56' })
  })

  it('does not claim a schema type, because there is no transaction schema', () => {
    expect(bankCsvAdapter.parse(NATWEST).schemaType).toBeUndefined()
  })

  it('returns nothing for a header with no rows', () => {
    expect(bankCsvAdapter.parse('Date,Description,Amount').records).toEqual([])
  })

  it('truncates a large statement', () => {
    const rows = Array.from({ length: 4000 }, (_, i) => `2026-01-15,ROW ${i},1.00`).join('\n')
    const result = bankCsvAdapter.parse(`Date,Description,Amount\n${rows}`, { limit: 500 })

    expect(result.records).toHaveLength(500)
    expect(result.totalFound).toBe(4000)
    expect(result.truncated).toBe(true)
  })
})

describe('adapter registry', () => {
  it('routes each fixture to its own adapter', () => {
    expect(detectAdapter('export.xml', APPLE_HEALTH_EXPORT)?.id).toBe('apple-health')
    expect(
      detectAdapter('takeout-history.json', JSON.stringify([{ a: 1 }]))?.id
    ).toBe('google-takeout')
    expect(detectAdapter('statement.csv', 'Date,Description,Amount\n2026-01-15,A,1')?.id).toBe(
      'bank-csv'
    )
  })

  it('returns null for a file no adapter claims, so the wizard still handles it', () => {
    // This is what keeps the feature additive. An unrecognised file must import
    // exactly as well as it did before adapters existed.
    expect(detectAdapter('notes.json', JSON.stringify([{ note: 'hello' }]))).toBeNull()
    expect(detectAdapter('contacts.csv', 'Name,Email\nA,a@b.c')).toBeNull()
    expect(parseWithAdapter('contacts.csv', 'Name,Email\nA,a@b.c')).toBeNull()
  })

  it('reports which adapter read the file', () => {
    const result = parseWithAdapter('export.xml', APPLE_HEALTH_EXPORT)

    expect(result).toMatchObject({ adapterId: 'apple-health', adapterLabel: 'Apple Health' })
  })

  it('detects from a leading slice, so a huge file is not scanned twice', () => {
    const padding = ' '.repeat(200_000)
    const xml = `<?xml version="1.0"?>\n<HealthData>${padding}<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="1" durationUnit="min" startDate="2026-01-15 08:00:00 -0800"/></HealthData>`

    expect(detectAdapter('export.xml', xml)?.id).toBe('apple-health')
  })
})
