/**
 * LD-210 Apple Health reader.
 *
 * Reads export.xml as it streams, from inside export.zip or unzipped, and turns
 * it into LD-209 records: one entry per day for activity, vitals, body
 * measurements, and nutrition; one per sleep session; one per workout. A year
 * of data becomes a few thousand entries rather than millions of samples.
 *
 * What the export's shape requires:
 * - A record nested in a Correlation (a blood pressure reading, a meal) also
 *   appears at the top level, so nested records are skipped. Reading both
 *   would count every meal twice.
 * - Every app and device writes its own records, and the export does not say
 *   which ones the Health app counted. Summed amounts such as steps take the
 *   largest single source each day: a phone and a watch both count the same
 *   walk, so adding them doubles it, and the largest source is the closest to
 *   what the Health app shows without ever counting anything twice.
 * - A night arrives as many samples, often from several sources. Samples are
 *   joined into sessions per source, and where sessions overlap the one with
 *   sleep stages wins.
 * - Values keep the unit the device chose. Each is converted to its field's
 *   unit, and a unit this reader does not know is skipped, not guessed.
 *
 * Every record is checked against its schema. A reading no body produces is
 * dropped from the record and counted, and a record with nothing left is
 * skipped, so nothing implausible is stored.
 *
 * An export is made part way through a day. That day's totals, and a night of
 * sleep that may not have ended, are left out: a record's key stays the same
 * across exports, so storing a partial day now would make a later export skip
 * the full one as already imported.
 */

import { scanTags } from '../xml-scan'
import type { VaultSchemaType } from '../../schemas/vault-schemas'
import { keepPlausible } from './plausible'
import type { ExportReadResult, ImportedRecord, ReadOptions } from './types'
import {
  exactly,
  round,
  toCelsius,
  toCentimetres,
  toGrams,
  toKilocalories,
  toKilograms,
  toKilometres,
  toMilligrams,
  toMillilitres,
  toMinutes,
  toPercent,
  type Converter,
} from './units'

export const APPLE_HEALTH = { provider: 'apple-health', label: 'Apple Health' } as const

interface Field {
  name: string
  convert: Converter
  places: number
}

const field = (name: string, convert: Converter, places: number): Field => ({ name, convert, places })

/** Summed over a day, largest single source. */
const ACTIVITY: Record<string, Field> = {
  HKQuantityTypeIdentifierStepCount: field('steps', exactly('count'), 0),
  HKQuantityTypeIdentifierDistanceWalkingRunning: field('distance_km', toKilometres, 2),
  HKQuantityTypeIdentifierActiveEnergyBurned: field('calories_out', toKilocalories, 0),
  HKQuantityTypeIdentifierFlightsClimbed: field('floors', exactly('count'), 0),
  HKQuantityTypeIdentifierAppleExerciseTime: field('active_minutes', toMinutes, 0),
}

/** Summed over a day, largest single source. */
const NUTRITION: Record<string, Field> = {
  HKQuantityTypeIdentifierDietaryEnergyConsumed: field('energy_kcal', toKilocalories, 0),
  HKQuantityTypeIdentifierDietaryProtein: field('protein_g', toGrams, 1),
  HKQuantityTypeIdentifierDietaryCarbohydrates: field('carbohydrates_g', toGrams, 1),
  HKQuantityTypeIdentifierDietaryFatTotal: field('fat_g', toGrams, 1),
  HKQuantityTypeIdentifierDietaryFiber: field('fiber_g', toGrams, 1),
  HKQuantityTypeIdentifierDietarySugar: field('sugar_g', toGrams, 1),
  HKQuantityTypeIdentifierDietarySodium: field('sodium_mg', toMilligrams, 0),
  HKQuantityTypeIdentifierDietaryWater: field('water_ml', toMillilitres, 0),
}

/** Averaged over a day. */
const VITALS: Record<string, Field> = {
  HKQuantityTypeIdentifierRestingHeartRate: field('resting_heart_rate', exactly('count/min'), 0),
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: field('heart_rate_variability_ms', exactly('ms'), 1),
  HKQuantityTypeIdentifierOxygenSaturation: field('blood_oxygen_pct', toPercent, 1),
  HKQuantityTypeIdentifierRespiratoryRate: field('respiratory_rate', exactly('count/min'), 1),
  HKQuantityTypeIdentifierBodyTemperature: field('body_temperature_c', toCelsius, 2),
  HKQuantityTypeIdentifierBloodPressureSystolic: field('blood_pressure_systolic', exactly('mmHg'), 0),
  HKQuantityTypeIdentifierBloodPressureDiastolic: field('blood_pressure_diastolic', exactly('mmHg'), 0),
}

/** The day's latest reading. */
const BODY: Record<string, Field> = {
  HKQuantityTypeIdentifierBodyMass: field('weight_kg', toKilograms, 2),
  HKQuantityTypeIdentifierHeight: field('height_cm', toCentimetres, 1),
  HKQuantityTypeIdentifierBodyFatPercentage: field('body_fat_pct', toPercent, 1),
  HKQuantityTypeIdentifierLeanBodyMass: field('lean_mass_kg', toKilograms, 2),
  HKQuantityTypeIdentifierWaistCircumference: field('waist_cm', toCentimetres, 1),
  HKQuantityTypeIdentifierBodyMassIndex: field('bmi', exactly('count'), 1),
}

const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis'

type Stage = 'inBed' | 'awake' | 'light' | 'deep' | 'rem' | 'asleep'

/** iOS 16 and later write stages; earlier versions write Asleep, still read as asleep. */
const SLEEP_STAGES: Record<string, Stage> = {
  HKCategoryValueSleepAnalysisInBed: 'inBed',
  HKCategoryValueSleepAnalysisAwake: 'awake',
  HKCategoryValueSleepAnalysisAsleepCore: 'light',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep',
  HKCategoryValueSleepAnalysisAsleep: 'asleep',
}

/** Samples further apart than this belong to different sessions. */
const SESSION_GAP_MS = 60 * 60 * 1000
/** Shorter than this is a stray sample, not a session. */
const SHORTEST_SESSION_MS = 10 * 60 * 1000

/** Apple's workout types, mapped onto the sport types the schema allows. */
const WORKOUT_TYPES: Record<string, string> = {
  running: 'Run',
  cycling: 'Ride',
  walking: 'Walk',
  hiking: 'Hike',
  swimming: 'Swim',
  traditionalstrengthtraining: 'WeightTraining',
  functionalstrengthtraining: 'WeightTraining',
  yoga: 'Yoga',
  highintensityintervaltraining: 'Workout',
}

export function appleWorkoutSport(raw: string | undefined): string {
  const key = (raw ?? '').replace(/^HKWorkoutActivityType/, '').toLowerCase()
  return WORKOUT_TYPES[key] ?? 'Other'
}

const WORKOUT_DISTANCES = new Set([
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierDistanceWheelchair',
  'HKQuantityTypeIdentifierDistanceDownhillSnowSports',
])

// --- Dates ---

export interface Moment {
  /** The calendar day where it happened, such as 2026-10-07. */
  day: string
  /** ISO 8601 with the original offset, so the local time survives. */
  iso: string
  ms: number
}

const APPLE_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/

/** Apple writes `2026-10-07 07:00:00 -0700`. */
export function parseAppleDate(value: string | undefined): Moment | null {
  const match = value ? APPLE_DATE.exec(value.trim()) : null
  if (!match) return null
  const iso = `${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}`
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : { day: match[1], iso, ms }
}

/** A second in UTC, the form record keys use. */
function utcSecond(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// --- Daily tables ---

type Mode = 'largestSource' | 'mean' | 'latest'

class DayTable {
  private readonly days = new Map<string, Map<string, Map<string, number> | { sum: number; n: number } | { at: number; value: number }>>()
  private readonly recorded = new Map<string, Moment>()

  constructor(private readonly mode: Mode) {}

  add(day: string, name: string, source: string, value: number, at: Moment, end: Moment): void {
    let fields = this.days.get(day)
    if (!fields) {
      fields = new Map()
      this.days.set(day, fields)
    }
    const cell = fields.get(name)
    if (this.mode === 'largestSource') {
      const sources = (cell as Map<string, number> | undefined) ?? new Map<string, number>()
      sources.set(source, (sources.get(source) ?? 0) + value)
      fields.set(name, sources)
    } else if (this.mode === 'mean') {
      const mean = (cell as { sum: number; n: number } | undefined) ?? { sum: 0, n: 0 }
      fields.set(name, { sum: mean.sum + value, n: mean.n + 1 })
    } else {
      const latest = cell as { at: number; value: number } | undefined
      if (!latest || at.ms >= latest.at) fields.set(name, { at: at.ms, value })
    }
    const seen = this.recorded.get(day)
    if (!seen || end.ms > seen.ms) this.recorded.set(day, end)
  }

  records(schemaType: VaultSchemaType, spec: Record<string, Field>): ImportedRecord[] {
    const places = new Map(Object.values(spec).map((entry) => [entry.name, entry.places]))
    return [...this.days.entries()].map(([day, fields]) => {
      const data: Record<string, unknown> = { date: day }
      for (const [name, cell] of fields) {
        let value: number
        if (cell instanceof Map) value = Math.max(...cell.values())
        else if ('n' in cell) value = cell.sum / cell.n
        else value = cell.value
        data[name] = round(value, places.get(name) ?? 2)
      }
      data.source = APPLE_HEALTH.label
      return {
        schemaType,
        data,
        sourceRecordId: `${schemaType}:${day}`,
        capturedAt: this.recorded.get(day)?.iso,
      }
    })
  }
}

// --- Sleep ---

interface SleepSample {
  source: string
  start: Moment
  end: Moment
  stage: Stage
}

interface Session {
  source: string
  start: Moment
  end: Moment
  minutes: Record<Stage, number>
}

function sessionsFrom(samples: SleepSample[]): Session[] {
  const bySource = new Map<string, SleepSample[]>()
  for (const sample of samples) {
    const list = bySource.get(sample.source) ?? []
    list.push(sample)
    bySource.set(sample.source, list)
  }

  const sessions: Session[] = []
  for (const [source, list] of bySource) {
    list.sort((a, b) => a.start.ms - b.start.ms)
    let current: Session | null = null
    for (const sample of list) {
      if (!current || sample.start.ms - current.end.ms > SESSION_GAP_MS) {
        if (current) sessions.push(current)
        current = {
          source,
          start: sample.start,
          end: sample.end,
          minutes: { inBed: 0, awake: 0, light: 0, deep: 0, rem: 0, asleep: 0 },
        }
      }
      if (sample.end.ms > current.end.ms) current.end = sample.end
      current.minutes[sample.stage] += (sample.end.ms - sample.start.ms) / 60000
    }
    if (current) sessions.push(current)
  }
  return sessions
}

const hasStages = (session: Session) =>
  session.minutes.light + session.minutes.deep + session.minutes.rem > 0
const asleepMinutes = (session: Session) =>
  session.minutes.light + session.minutes.deep + session.minutes.rem + session.minutes.asleep

/** One session per stretch of time: where sources overlap, stages first, then the most sleep. */
function chooseSessions(sessions: Session[]): Session[] {
  const ranked = [...sessions].sort(
    (a, b) => Number(hasStages(b)) - Number(hasStages(a)) || asleepMinutes(b) - asleepMinutes(a)
  )
  const chosen: Session[] = []
  for (const session of ranked) {
    const overlaps = chosen.some(
      (other) => session.start.ms < other.end.ms && other.start.ms < session.end.ms
    )
    if (!overlaps) chosen.push(session)
  }
  return chosen
}

function sleepRecord(session: Session): ImportedRecord {
  const windowMinutes = (session.end.ms - session.start.ms) / 60000
  const asleep = asleepMinutes(session)
  const data: Record<string, unknown> = {
    start: session.start.iso,
    end: session.end.iso,
    asleep_min: Math.round(asleep),
  }
  if (session.minutes.awake > 0) data.awake_min = Math.round(session.minutes.awake)
  if (hasStages(session)) {
    data.light_min = Math.round(session.minutes.light)
    data.deep_min = Math.round(session.minutes.deep)
    data.rem_min = Math.round(session.minutes.rem)
  }
  if (asleep > 0 && windowMinutes > 0) {
    data.efficiency_pct = round(Math.min(100, (asleep / windowMinutes) * 100), 1)
  }
  data.source = session.source
  return {
    schemaType: 'sleep_session',
    data,
    sourceRecordId: `sleep_session:${utcSecond(session.start.ms)}`,
    capturedAt: session.start.iso,
  }
}

// --- Workouts ---

interface OpenWorkout {
  attributes: Record<string, string>
  /** The workout's own totals. */
  statistics: Record<string, string>[]
  /** Each activity's totals. Newer exports split a workout into activities, a multisport one into several. */
  activityStatistics: Record<string, string>[]
}

const sumOf = (statistics: Record<string, string>[], pick: (statistic: Record<string, string>) => number | null) => {
  let total: number | null = null
  for (const statistic of statistics) {
    const value = pick(statistic)
    if (value !== null && Number.isFinite(value)) total = (total ?? 0) + value
  }
  return total
}

function workoutRecord(workout: OpenWorkout): ImportedRecord | null {
  const a = workout.attributes
  const start = parseAppleDate(a.startDate)
  if (!start) return null
  const sport = appleWorkoutSport(a.workoutActivityType)
  const data: Record<string, unknown> = {
    name: `${sport} workout`,
    sport_type: sport,
    start_date: start.iso,
  }

  const duration = a.duration === undefined ? null : toMinutes(Number(a.duration), a.durationUnit ?? 'min')
  if (duration !== null && Number.isFinite(duration)) data.duration_min = round(duration, 1)

  // Older exports put totals on the workout. Newer ones put them in statistics,
  // the workout's own after one set for each activity, and the workout's own
  // are the totals: an activity's are only its part.
  const distanceOf = (statistic: Record<string, string>) =>
    WORKOUT_DISTANCES.has(statistic.type) ? toKilometres(Number(statistic.sum), statistic.unit) : null
  const energyOf = (statistic: Record<string, string>) =>
    statistic.type === 'HKQuantityTypeIdentifierActiveEnergyBurned'
      ? toKilocalories(Number(statistic.sum), statistic.unit)
      : null
  const heartRates = (statistics: Record<string, string>[]) =>
    statistics.filter(
      (statistic) => statistic.type === 'HKQuantityTypeIdentifierHeartRate' && statistic.unit === 'count/min'
    )

  const distance =
    (a.totalDistance === undefined ? null : toKilometres(Number(a.totalDistance), a.totalDistanceUnit)) ??
    sumOf(workout.statistics, distanceOf) ??
    sumOf(workout.activityStatistics, distanceOf)
  const energy =
    (a.totalEnergyBurned === undefined
      ? null
      : toKilocalories(Number(a.totalEnergyBurned), a.totalEnergyBurnedUnit)) ??
    sumOf(workout.statistics, energyOf) ??
    sumOf(workout.activityStatistics, energyOf)

  const [overall] = heartRates(workout.statistics)
  const parts = heartRates(workout.activityStatistics)
  if (overall || parts.length === 1) {
    const rate = overall ?? parts[0]
    const average = Number(rate.average)
    const maximum = Number(rate.maximum)
    if (Number.isFinite(average)) data.average_heartrate = Math.round(average)
    if (Number.isFinite(maximum)) data.max_heartrate = Math.round(maximum)
  } else if (parts.length > 1) {
    // Activities' averages cannot be combined without their durations, but the highest is the highest.
    const maximum = Math.max(...parts.map((rate) => Number(rate.maximum)).filter(Number.isFinite))
    if (Number.isFinite(maximum)) data.max_heartrate = Math.round(maximum)
  }
  if (distance !== null && Number.isFinite(distance)) data.distance_km = round(distance, 2)
  if (energy !== null && Number.isFinite(energy)) data.calories = Math.round(energy)
  data.source = a.sourceName ?? APPLE_HEALTH.label

  return {
    schemaType: 'fitness_activity',
    data,
    sourceRecordId: `fitness_activity:${utcSecond(start.ms)}`,
    capturedAt: start.iso,
  }
}

// --- Reading ---

async function* counted(
  chunks: AsyncIterable<string> | Iterable<string>,
  { onProgress, signal }: ReadOptions
): AsyncGenerator<string> {
  let read = 0
  signal?.throwIfAborted()
  for await (const chunk of chunks) {
    signal?.throwIfAborted()
    read += chunk.length
    onProgress?.(read)
    yield chunk
  }
}

/** Read export.xml, given as text in chunks split anywhere. */
export async function readAppleHealth(
  chunks: AsyncIterable<string> | Iterable<string>,
  options: ReadOptions = {}
): Promise<ExportReadResult> {
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }

  const activity = new DayTable('largestSource')
  const nutrition = new DayTable('largestSource')
  const vitals = new DayTable('mean')
  const body = new DayTable('latest')
  const tables: [DayTable, Record<string, Field>][] = [
    [activity, ACTIVITY],
    [nutrition, NUTRITION],
    [vitals, VITALS],
    [body, BODY],
  ]
  const sleep: SleepSample[] = []
  const workouts: ImportedRecord[] = []
  let insideCorrelation = 0
  let insideActivity = 0
  let workout: OpenWorkout | null = null
  let exportedAt: Moment | null = null

  const finishWorkout = () => {
    if (!workout) return
    const record = workoutRecord(workout)
    if (record) workouts.push(record)
    else skip('unreadable')
    workout = null
  }

  for await (const tag of scanTags(counted(chunks, options), [
    'ExportDate',
    'Record',
    'Correlation',
    'Workout',
    'WorkoutActivity',
    'WorkoutStatistics',
  ])) {
    if (tag.name === 'ExportDate') {
      if (!tag.closing) exportedAt = parseAppleDate(tag.attributes.value) ?? exportedAt
      continue
    }
    if (tag.name === 'Correlation') {
      if (tag.closing) insideCorrelation = Math.max(0, insideCorrelation - 1)
      else if (!tag.selfClosing) insideCorrelation++
      continue
    }
    if (tag.name === 'Workout') {
      if (tag.closing) finishWorkout()
      else {
        finishWorkout()
        workout = { attributes: tag.attributes, statistics: [], activityStatistics: [] }
        insideActivity = 0
        if (tag.selfClosing) finishWorkout()
      }
      continue
    }
    if (tag.name === 'WorkoutActivity') {
      if (tag.closing) insideActivity = Math.max(0, insideActivity - 1)
      else if (!tag.selfClosing) insideActivity++
      continue
    }
    if (tag.name === 'WorkoutStatistics') {
      if (workout && !tag.closing) {
        ;(insideActivity > 0 ? workout.activityStatistics : workout.statistics).push(tag.attributes)
      }
      continue
    }
    // A record inside a correlation is repeated at the top level.
    if (tag.closing || insideCorrelation > 0) continue

    const a = tag.attributes
    if (a.type === SLEEP_TYPE) {
      const stage = SLEEP_STAGES[a.value ?? '']
      const start = parseAppleDate(a.startDate)
      const end = parseAppleDate(a.endDate)
      if (!stage || !start || !end || end.ms <= start.ms) skip('unreadable')
      else sleep.push({ source: a.sourceName ?? APPLE_HEALTH.label, start, end, stage })
      continue
    }

    const entry = tables.find(([, spec]) => a.type in spec)
    if (!entry) continue
    const [table, spec] = entry
    const definition = spec[a.type]
    const start = parseAppleDate(a.startDate)
    const end = parseAppleDate(a.endDate) ?? start
    const value = Number(a.value)
    if (!start || !end || a.value === undefined || !Number.isFinite(value)) {
      skip('unreadable')
      continue
    }
    const converted = definition.convert(value, a.unit)
    if (converted === null) {
      skip('unknown_unit')
      continue
    }
    table.add(start.day, definition.name, a.sourceName ?? APPLE_HEALTH.label, converted, start, end)
  }
  finishWorkout()

  const exported: Moment | null = exportedAt
  let unfinished = false
  const finished = <T,>(isFinished: (item: T) => boolean) => (item: T) => {
    if (isFinished(item)) return true
    unfinished = true
    return false
  }
  const days = [
    ...activity.records('fitness_daily', ACTIVITY),
    ...vitals.records('vitals_daily', VITALS),
    ...body.records('body_measurement', BODY),
    ...nutrition.records('nutrition_daily', NUTRITION),
  ].filter(finished((record: ImportedRecord) => !exported || String(record.data.date) < exported.day))
  // A night could carry on after the export as long as a new sample would still join it.
  const nights = chooseSessions(sessionsFrom(sleep))
    .filter((session) => session.end.ms - session.start.ms >= SHORTEST_SESSION_MS)
    .filter(finished((session: Session) => !exported || session.end.ms <= exported.ms - SESSION_GAP_MS))
    .map(sleepRecord)

  const records = [...days, ...nights, ...workouts]
    .map((record) => keepPlausible(record, skip))
    .filter((record): record is ImportedRecord => record !== null)
    .sort((a, b) => Date.parse(a.capturedAt ?? '') - Date.parse(b.capturedAt ?? '') || 0)

  return { ...APPLE_HEALTH, records, skipped, ...(unfinished && exported ? { unfinishedDay: exported.day } : {}) }
}
