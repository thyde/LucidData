import { describe, expect, it } from 'vitest'
import { readAppleHealth, parseAppleDate } from '../apple-health'
import { SOURCE_RECORD_ID_PATTERN } from '../../../validations/provenance'

// Element and attribute shapes follow Apple's export DTD (HealthKit Export
// Version 14): Records carry type, unit, value, sourceName, startDate, and
// endDate; a Correlation repeats its records at the top level; newer Workouts
// carry WorkoutStatistics children and older ones totals as attributes.
const record = (type: string, value: string | number, unit: string, start: string, end = start, source = 'Watch') =>
  `<Record type="${type}" sourceName="${source}" unit="${unit}" creationDate="${end}" startDate="${start}" endDate="${end}" value="${value}"/>`
const sleep = (value: string, start: string, end: string, source = 'Watch') =>
  `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" creationDate="${end}" startDate="${start}" endDate="${end}" value="HKCategoryValueSleepAnalysis${value}"/>`

const DAY = '2026-10-07'
const at = (time: string, day = DAY) => `${day} ${time} -0700`

const EXPORT = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ATTLIST Record type CDATA #REQUIRED>
]>
<HealthData locale="en_US">
 <ExportDate value="2026-10-08 09:00:00 -0700"/>
 ${record('HKQuantityTypeIdentifierStepCount', 2000, 'count', at('08:00:00'), at('08:30:00'), 'iPhone')}
 ${record('HKQuantityTypeIdentifierStepCount', 3000, 'count', at('12:00:00'), at('12:30:00'), 'iPhone')}
 ${record('HKQuantityTypeIdentifierStepCount', 4000, 'count', at('08:00:00'), at('08:30:00'))}
 ${record('HKQuantityTypeIdentifierStepCount', 3000, 'count', at('12:00:00'), at('12:30:00'))}
 ${record('HKQuantityTypeIdentifierDistanceWalkingRunning', 2.0, 'mi', at('08:00:00'), at('12:30:00'), 'iPhone')}
 ${record('HKQuantityTypeIdentifierDistanceWalkingRunning', 1.5, 'mi', at('08:00:00'), at('12:30:00'))}
 ${record('HKQuantityTypeIdentifierActiveEnergyBurned', 350, 'kcal', at('09:00:00'), at('20:00:00'))}
 ${record('HKQuantityTypeIdentifierAppleExerciseTime', 42, 'min', at('18:00:00'), at('18:42:00'))}
 ${record('HKQuantityTypeIdentifierFlightsClimbed', 9, 'count', at('10:00:00'), at('16:00:00'), 'iPhone')}
 ${record('HKQuantityTypeIdentifierDietaryEnergyConsumed', 600, 'kcal', at('13:00:00'), at('13:00:00'), 'Lose It!')}
 ${record('HKQuantityTypeIdentifierDietaryProtein', 30, 'g', at('13:00:00'), at('13:00:00'), 'Lose It!')}
 <Correlation type="HKCorrelationTypeIdentifierFood" sourceName="Lose It!" startDate="${at('13:00:00')}" endDate="${at('13:00:00')}">
  <MetadataEntry key="HKFoodType" value="Lunch"/>
  ${record('HKQuantityTypeIdentifierDietaryEnergyConsumed', 600, 'kcal', at('13:00:00'), at('13:00:00'), 'Lose It!')}
  ${record('HKQuantityTypeIdentifierDietaryProtein', 30, 'g', at('13:00:00'), at('13:00:00'), 'Lose It!')}
 </Correlation>
 ${record('HKQuantityTypeIdentifierDietarySodium', 2300, 'mg', at('19:00:00'), at('19:00:00'), 'Lose It!')}
 ${record('HKQuantityTypeIdentifierDietaryWater', 16, 'fl_oz_us', at('15:00:00'), at('15:00:00'), 'WaterMinder')}
 ${record('HKQuantityTypeIdentifierRestingHeartRate', 58, 'count/min', at('06:00:00'))}
 ${record('HKQuantityTypeIdentifierRestingHeartRate', 60, 'count/min', at('22:00:00'))}
 ${record('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 42.5, 'ms', at('03:00:00'))}
 ${record('HKQuantityTypeIdentifierOxygenSaturation', 0.97, '%', at('02:00:00'))}
 ${record('HKQuantityTypeIdentifierOxygenSaturation', 0.95, '%', at('04:00:00'))}
 ${record('HKQuantityTypeIdentifierRespiratoryRate', 14.5, 'count/min', at('03:30:00'))}
 ${record('HKQuantityTypeIdentifierBodyTemperature', 98.6, 'degF', at('07:30:00'), at('07:30:00'), 'Thermometer')}
 <Correlation type="HKCorrelationTypeIdentifierBloodPressure" sourceName="Omron" startDate="${at('07:45:00')}" endDate="${at('07:45:00')}">
  ${record('HKQuantityTypeIdentifierBloodPressureSystolic', 118, 'mmHg', at('07:45:00'), at('07:45:00'), 'Omron')}
  ${record('HKQuantityTypeIdentifierBloodPressureDiastolic', 76, 'mmHg', at('07:45:00'), at('07:45:00'), 'Omron')}
 </Correlation>
 ${record('HKQuantityTypeIdentifierBloodPressureSystolic', 118, 'mmHg', at('07:45:00'), at('07:45:00'), 'Omron')}
 ${record('HKQuantityTypeIdentifierBloodPressureDiastolic', 76, 'mmHg', at('07:45:00'), at('07:45:00'), 'Omron')}
 ${record('HKQuantityTypeIdentifierRestingHeartRate', 5, 'count/min', at('06:00:00', '2026-10-08'))}
 ${record('HKQuantityTypeIdentifierRespiratoryRate', 15, 'count/min', at('03:00:00', '2026-10-08'))}
 ${record('HKQuantityTypeIdentifierBodyMass', 160, 'lb', at('07:00:00'), at('07:00:00'), 'Scale')}
 ${record('HKQuantityTypeIdentifierBodyMass', 159, 'lb', at('21:00:00'), at('21:00:00'), 'Scale')}
 ${record('HKQuantityTypeIdentifierBodyMass', 9, 'slug', at('21:30:00'), at('21:30:00'), 'Odd app')}
 ${record('HKQuantityTypeIdentifierBodyFatPercentage', 0.215, '%', at('07:00:00'), at('07:00:00'), 'Scale')}
 ${record('HKQuantityTypeIdentifierLeanBodyMass', 56.6, 'kg', at('07:00:00'), at('07:00:00'), 'Scale')}
 ${record('HKQuantityTypeIdentifierHeight', 178, 'cm', at('07:00:00'), at('07:00:00'), 'Health')}
 ${record('HKQuantityTypeIdentifierWaistCircumference', 32, 'in', at('07:00:00'), at('07:00:00'), 'Health')}
 ${record('HKQuantityTypeIdentifierBodyMassIndex', 22.8, 'count', at('07:00:00'), at('07:00:00'), 'Scale')}
 ${sleep('InBed', at('22:30:00', '2026-10-06'), at('06:45:00'), 'iPhone')}
 ${sleep('AsleepCore', at('22:50:00', '2026-10-06'), at('23:50:00', '2026-10-06'))}
 ${sleep('AsleepDeep', at('23:50:00', '2026-10-06'), at('00:40:00'))}
 ${sleep('AsleepREM', at('00:40:00'), at('01:30:00'))}
 ${sleep('Awake', at('01:30:00'), at('01:40:00'))}
 ${sleep('AsleepCore', at('01:40:00'), at('05:40:00'))}
 ${sleep('AsleepREM', at('05:40:00'), at('06:30:00'))}
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30.5" durationUnit="min" sourceName="Sam&apos;s Apple Watch" startDate="${at('18:00:00')}" endDate="${at('18:30:30')}">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="${at('18:00:00')}" endDate="${at('18:30:30')}" average="152" minimum="98" maximum="171" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${at('18:00:00')}" endDate="${at('18:30:30')}" sum="410" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="${at('18:00:00')}" endDate="${at('18:30:30')}" sum="5.1" unit="km"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" totalDistance="20" totalDistanceUnit="mi" totalEnergyBurned="600" totalEnergyBurnedUnit="kcal" sourceName="Strava" startDate="${at('07:00:00', '2026-10-05')}" endDate="${at('08:00:00', '2026-10-05')}"/>
</HealthData>
`

function byType(result: Awaited<ReturnType<typeof readAppleHealth>>, schemaType: string) {
  return result.records.filter((entry) => entry.schemaType === schemaType)
}

describe('readAppleHealth', () => {
  it('takes the largest single source of a day, never the sum of two that counted the same walk', async () => {
    const result = await readAppleHealth([EXPORT])
    expect(byType(result, 'fitness_daily')).toEqual([
      {
        schemaType: 'fitness_daily',
        data: {
          date: DAY,
          steps: 7000,
          distance_km: 3.22,
          calories_out: 350,
          active_minutes: 42,
          floors: 9,
          source: 'Apple Health',
        },
        sourceRecordId: `fitness_daily:${DAY}`,
        capturedAt: '2026-10-07T20:00:00-07:00',
      },
    ])
  })

  it('counts a meal once, though the export lists it inside its correlation as well', async () => {
    const [day] = byType(await readAppleHealth([EXPORT]), 'nutrition_daily')
    expect(day.data).toEqual({
      date: DAY,
      energy_kcal: 600,
      protein_g: 30,
      sodium_mg: 2300,
      water_ml: 473,
      source: 'Apple Health',
    })
  })

  it('averages vitals, converts units and fractions, and reads blood pressure once', async () => {
    const vitals = byType(await readAppleHealth([EXPORT]), 'vitals_daily')
    expect(vitals.map((entry) => entry.data)).toEqual([
      {
        date: DAY,
        resting_heart_rate: 59,
        heart_rate_variability_ms: 42.5,
        blood_oxygen_pct: 96,
        respiratory_rate: 14.5,
        body_temperature_c: 37,
        blood_pressure_systolic: 118,
        blood_pressure_diastolic: 76,
        source: 'Apple Health',
      },
      // A resting heart rate of 5 is dropped; the day's other reading is kept.
      { date: '2026-10-08', respiratory_rate: 15, source: 'Apple Health' },
    ])
  })

  it("keeps the day's latest body measurement and converts it", async () => {
    const [day] = byType(await readAppleHealth([EXPORT]), 'body_measurement')
    expect(day.data).toEqual({
      date: DAY,
      weight_kg: 72.12,
      body_fat_pct: 21.5,
      lean_mass_kg: 56.6,
      height_cm: 178,
      waist_cm: 81.3,
      bmi: 22.8,
      source: 'Apple Health',
    })
  })

  it('joins a night into one session and prefers the source with sleep stages', async () => {
    const sessions = byType(await readAppleHealth([EXPORT]), 'sleep_session')
    expect(sessions).toEqual([
      {
        schemaType: 'sleep_session',
        data: {
          start: '2026-10-06T22:50:00-07:00',
          end: '2026-10-07T06:30:00-07:00',
          asleep_min: 450,
          awake_min: 10,
          light_min: 300,
          deep_min: 50,
          rem_min: 100,
          efficiency_pct: 97.8,
          source: 'Watch',
        },
        sourceRecordId: 'sleep_session:2026-10-07T05:50:00Z',
        capturedAt: '2026-10-06T22:50:00-07:00',
      },
    ])
  })

  it('reads workouts in both the newer and the older format', async () => {
    const workouts = byType(await readAppleHealth([EXPORT]), 'fitness_activity')
    expect(workouts.map((entry) => [entry.sourceRecordId, entry.data])).toEqual([
      [
        'fitness_activity:2026-10-05T14:00:00Z',
        {
          name: 'Ride workout',
          sport_type: 'Ride',
          start_date: '2026-10-05T07:00:00-07:00',
          duration_min: 60,
          distance_km: 32.19,
          calories: 600,
          source: 'Strava',
        },
      ],
      [
        'fitness_activity:2026-10-08T01:00:00Z',
        {
          name: 'Run workout',
          sport_type: 'Run',
          start_date: '2026-10-07T18:00:00-07:00',
          duration_min: 30.5,
          average_heartrate: 152,
          max_heartrate: 171,
          distance_km: 5.1,
          calories: 410,
          source: "Sam's Apple Watch",
        },
      ],
    ])
  })

  it('says what it could not use', async () => {
    const result = await readAppleHealth([EXPORT])
    expect(result.skipped).toEqual({ unknown_unit: 1, implausible: 1 })
    expect(result.provider).toBe('apple-health')
  })

  it('gives every record a key the vault accepts, and the same key every time', async () => {
    const first = await readAppleHealth([EXPORT])
    const second = await readAppleHealth([EXPORT])
    for (const entry of first.records) expect(entry.sourceRecordId).toMatch(SOURCE_RECORD_ID_PATTERN)
    expect(new Set(first.records.map((entry) => entry.sourceRecordId)).size).toBe(first.records.length)
    expect(second.records.map((entry) => entry.sourceRecordId)).toEqual(
      first.records.map((entry) => entry.sourceRecordId)
    )
  })

  it('reads the same records however the text is split', async () => {
    const whole = await readAppleHealth([EXPORT])
    const pieces: string[] = []
    for (let index = 0; index < EXPORT.length; index += 7) pieces.push(EXPORT.slice(index, index + 7))
    let progress = 0
    const split = await readAppleHealth(pieces, { onProgress: (characters) => (progress = characters) })
    expect(split).toEqual(whole)
    expect(progress).toBe(EXPORT.length)
  })
})

describe('parseAppleDate', () => {
  it('keeps the local day and offset', () => {
    expect(parseAppleDate('2026-10-07 23:30:00 -0700')).toEqual({
      day: '2026-10-07',
      iso: '2026-10-07T23:30:00-07:00',
      ms: Date.UTC(2026, 9, 8, 6, 30),
    })
    expect(parseAppleDate('yesterday')).toBeNull()
  })
})
