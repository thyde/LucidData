/**
 * LD-214 health timeline.
 *
 * Turns decrypted vault entries into one daily series per metric. It runs in
 * the browser, and in the app, on data the server cannot read; nothing here
 * sends anything anywhere.
 *
 * Several sources often report the same thing: a watch's own export, Apple
 * Health's copy of it, and a value typed by hand. Adding them up would count
 * the same steps twice, so a daily figure takes one source per day, by
 * SOURCE_PRIORITY, and says which one it took and which others it passed over.
 * Workouts and nights are events rather than daily figures, so they are
 * matched instead: a workout two sources recorded is the same workout when
 * the two start within ten minutes of each other, and a night is the same
 * night when the two overlap for most of the shorter one. Each is kept once,
 * from the best source, and the day adds up what is left.
 *
 * Days with no value are left out of a series rather than filled in, so a
 * chart shows them as gaps.
 */

/** A decrypted entry, with the provenance the vault keeps beside it. */
export interface TimelineEntry {
  schemaType: string | null
  data: Record<string, unknown> | null
  /** The provider slug, such as `garmin`. Null for an entry typed by hand. */
  provider: string | null
  /** When the source recorded it, as an ISO timestamp, if known. */
  capturedAt?: string | null
}

export type MetricId =
  | 'steps'
  | 'active_minutes'
  | 'distance_km'
  | 'active_calories'
  | 'workout_minutes'
  | 'sleep_hours'
  | 'resting_heart_rate'
  | 'heart_rate_variability'
  | 'blood_oxygen'
  | 'respiratory_rate'
  | 'weight_kg'
  | 'energy_intake'

export interface MetricDefinition {
  id: MetricId
  label: string
  unit: string
  decimals: number
  /** How a source's several values for one day become one. */
  combine: 'max' | 'mean' | 'latest' | 'sum'
  /**
   * Whether a day with nothing recorded counts as zero. A day without a
   * workout had none, so workouts compare weekly totals; a day without a
   * heart rate reading was simply not measured, so readings compare averages.
   */
  absentIsZero?: boolean
}

export const METRICS: readonly MetricDefinition[] = [
  { id: 'steps', label: 'Steps', unit: 'steps', decimals: 0, combine: 'max' },
  { id: 'active_minutes', label: 'Active minutes', unit: 'min', decimals: 0, combine: 'max' },
  { id: 'distance_km', label: 'Distance', unit: 'km', decimals: 1, combine: 'max' },
  { id: 'active_calories', label: 'Active energy', unit: 'kcal', decimals: 0, combine: 'max' },
  { id: 'workout_minutes', label: 'Workouts', unit: 'min', decimals: 0, combine: 'sum', absentIsZero: true },
  { id: 'sleep_hours', label: 'Sleep', unit: 'h', decimals: 1, combine: 'sum' },
  { id: 'resting_heart_rate', label: 'Resting heart rate', unit: 'bpm', decimals: 0, combine: 'mean' },
  { id: 'heart_rate_variability', label: 'Heart rate variability', unit: 'ms', decimals: 0, combine: 'mean' },
  { id: 'blood_oxygen', label: 'Blood oxygen', unit: '%', decimals: 1, combine: 'mean' },
  { id: 'respiratory_rate', label: 'Breathing rate', unit: 'breaths/min', decimals: 1, combine: 'mean' },
  { id: 'weight_kg', label: 'Weight', unit: 'kg', decimals: 1, combine: 'latest' },
  { id: 'energy_intake', label: 'Food energy', unit: 'kcal', decimals: 0, combine: 'max' },
]

/** Which field of which entry type feeds each metric, and how to read it. */
// Sleep comes from sleep sessions only: a day total beside them could not be
// matched against a night, and would count it twice.
const FIELDS: { schemaType: string; field: string; metric: MetricId; scale?: number; notFrom?: readonly string[] }[] = [
  { schemaType: 'fitness_daily', field: 'steps', metric: 'steps' },
  { schemaType: 'fitness_daily', field: 'active_minutes', metric: 'active_minutes' },
  { schemaType: 'fitness_daily', field: 'distance_km', metric: 'distance_km' },
  // The retired Fitbit connector stored Fitbit's caloriesOut here, which is
  // everything burned that day rather than active energy.
  { schemaType: 'fitness_daily', field: 'calories_out', metric: 'active_calories', notFrom: ['fitbit'] },
  { schemaType: 'fitness_daily', field: 'resting_heart_rate', metric: 'resting_heart_rate' },
  { schemaType: 'vitals_daily', field: 'resting_heart_rate', metric: 'resting_heart_rate' },
  { schemaType: 'vitals_daily', field: 'heart_rate_variability_ms', metric: 'heart_rate_variability' },
  { schemaType: 'vitals_daily', field: 'blood_oxygen_pct', metric: 'blood_oxygen' },
  { schemaType: 'vitals_daily', field: 'respiratory_rate', metric: 'respiratory_rate' },
  { schemaType: 'body_measurement', field: 'weight_kg', metric: 'weight_kg' },
  { schemaType: 'nutrition_daily', field: 'energy_kcal', metric: 'energy_intake' },
]

/**
 * Which source a day takes when several report the same metric. A value the
 * person typed comes first, then a device's own export, then services that
 * gather other devices' data, which may hold a copy of a device's numbers.
 */
export const SOURCE_PRIORITY: readonly string[] = [
  'manual',
  'garmin',
  'oura',
  'fitbit',
  'samsung-health',
  'apple-health',
  'google-health',
  'strava',
  'strava-archive',
]

/** Sources whose slug does not read as their name. */
const SOURCE_NAMES: Record<string, string> = {
  manual: 'Entered by you',
  // The same Strava activities, brought in from the account archive.
  'strava-archive': 'Strava',
}

/** The person's name for a source. */
export function sourceLabel(source: string): string {
  if (SOURCE_NAMES[source]) return SOURCE_NAMES[source]
  return source
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function rank(source: string): number {
  const index = SOURCE_PRIORITY.indexOf(source)
  return index < 0 ? SOURCE_PRIORITY.length : index
}

/** Sources best first: by priority, then by name, so the order never depends on input order. */
export function bySourcePriority(a: string, b: string): number {
  return rank(a) - rank(b) || a.localeCompare(b)
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const OFFSET = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?[+-]\d{2}:?\d{2}$/

// Building a formatter costs far more than using one, and a vault has
// thousands of timestamps, so there is one per time zone.
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

/** The calendar day an instant falls on in a time zone, the runtime's by default. */
export function dayInZone(ms: number, timeZone?: string): string {
  const key = timeZone ?? ''
  let formatter = FORMATTERS.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    FORMATTERS.set(key, formatter)
  }
  return formatter.format(ms)
}

/**
 * The calendar day something happened on, where it happened. A timestamp with
 * its own offset keeps the date it was written with; one in UTC is placed in
 * the reader's time zone; a bare date is kept as it is.
 */
export function dayOf(value: unknown, timeZone?: string): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (DAY.test(text)) return text
  const local = OFFSET.exec(text)
  if (local) return local[1]
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) return null
  return dayInZone(ms, timeZone)
}

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export interface DayValue {
  date: string
  value: number
  /** The source this day's value came from. */
  source: string
  /** Every source that reported this metric on this day, best first. */
  sources: string[]
}

export interface Trend {
  /**
   * The last seven days: their total for a metric where a quiet day counts as
   * zero, otherwise the mean of the days with a value.
   */
  recent: number
  /** The same for the seven days before those. */
  previous: number
  /** The difference as a fraction of the earlier mean, such as 0.06 for six percent more. */
  change: number
}

export interface MetricSeries {
  metric: MetricDefinition
  days: DayValue[]
  latest: DayValue | null
  trend: Trend | null
}

interface Reading {
  metric: MetricId
  day: string
  source: string
  value: number
  /** For `latest`: when the reading was taken, as epoch milliseconds. */
  at: number
}

/** A workout or a night: something with a time, rather than a figure for a day. */
interface Event {
  metric: 'workout_minutes' | 'sleep_hours'
  day: string
  source: string
  start: number | null
  end: number | null
  value: number
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function combine(values: Reading[], how: MetricDefinition['combine']): number {
  if (how === 'max') return Math.max(...values.map((reading) => reading.value))
  if (how === 'sum') return values.reduce((total, reading) => total + reading.value, 0)
  if (how === 'mean') return values.reduce((total, reading) => total + reading.value, 0) / values.length
  return [...values].sort((a, b) => b.at - a.at)[0].value
}

const TEN_MINUTES = 10 * 60 * 1000

function sameEvent(a: Event, b: Event): boolean {
  if (a.metric !== b.metric || a.source === b.source || a.start === null || b.start === null) return false
  // Start times are instants, so the copies match even when the two sources
  // place the workout on different calendar days.
  if (a.metric === 'workout_minutes') return Math.abs(a.start - b.start) <= TEN_MINUTES
  if (a.end === null || b.end === null) return false
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start)
  return overlap > 0 && overlap >= Math.min(a.end - a.start, b.end - b.start) / 2
}

/** One copy of each workout and night, from the best source that recorded it. */
function distinctEvents(events: Event[]): Event[] {
  const kept: Event[] = []
  for (const event of [...events].sort((a, b) => bySourcePriority(a.source, b.source))) {
    if (!kept.some((other) => sameEvent(other, event))) kept.push(event)
  }
  return kept
}

/** A calendar day moved by a number of days. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

function trendOf(metric: MetricDefinition, days: DayValue[], today: string, covered: string): Trend | null {
  let end = today
  if (metric.absentIsZero) {
    // A total counts every day without a record as zero, which is only true
    // up to the last day the data reaches. An export stops on the day it was
    // made, so the weeks end there, and there is no trend once that is more
    // than a day ago.
    if (covered < addDays(today, -1)) return null
    if (covered < today) end = covered
  }
  const window = (from: string, to: string) =>
    days.filter((day) => day.date > from && day.date <= to).map((day) => day.value)
  // Totals where a quiet day counts as zero, needing a day of activity in each
  // week; otherwise the mean of the days measured, needing two in each.
  const summarise = (values: number[]) => {
    const total = values.reduce((sum, value) => sum + value, 0)
    if (metric.absentIsZero) return values.length >= 1 ? total : null
    return values.length >= 2 ? total / values.length : null
  }
  const recent = summarise(window(addDays(end, -7), end))
  const previous = summarise(window(addDays(end, -14), addDays(end, -7)))
  if (recent === null || previous === null || previous === 0) return null
  return { recent, previous, change: (recent - previous) / previous }
}

export interface TimelineOptions {
  /** The first day to include, inclusive. */
  from?: string
  /** The last day to include, inclusive, and the day trends end on. Defaults to the latest day with data. */
  to?: string
  /** The reader's time zone, for timestamps in UTC. Defaults to the runtime's. */
  timeZone?: string
}

/** Every metric's daily series, from decrypted entries. */
export function buildTimeline(entries: readonly TimelineEntry[], options: TimelineOptions = {}): MetricSeries[] {
  const readings: Reading[] = []
  const events: Event[] = []

  for (const entry of entries) {
    const data = entry.data
    if (!data || typeof data !== 'object' || !entry.schemaType) continue
    const source = entry.provider ?? 'manual'
    const at = Date.parse(entry.capturedAt ?? '') || 0

    if (entry.schemaType === 'fitness_activity') {
      const written = typeof data.start_date === 'string' ? data.start_date : null
      let day: string | null
      let startMs = NaN
      if (written && written.length > 10) {
        day = dayOf(written, options.timeZone)
        startMs = Date.parse(written)
      } else {
        // Strava's records carry a date only, in UTC; the entry's capture time
        // has the start. It comes back from the database as UTC with an
        // offset of +00:00, which says nothing about where the person was, so
        // it is placed in the reader's time zone rather than kept as written.
        startMs = Date.parse(entry.capturedAt ?? '')
        day = Number.isNaN(startMs) ? dayOf(written, options.timeZone) : dayInZone(startMs, options.timeZone)
      }
      const minutes = numberOf(data.duration_min)
      if (day && minutes !== null && minutes > 0) {
        events.push({ metric: 'workout_minutes', day, source, start: Number.isNaN(startMs) ? null : startMs, end: null, value: minutes })
      }
      continue
    }

    if (entry.schemaType === 'sleep_session') {
      // A night belongs to the day it ends on, the morning the person wakes.
      const day = dayOf(data.end, options.timeZone)
      const minutes = numberOf(data.asleep_min)
      if (day && minutes !== null && minutes > 0) {
        const start = Date.parse(String(data.start))
        const end = Date.parse(String(data.end))
        events.push({
          metric: 'sleep_hours',
          day,
          source,
          start: Number.isNaN(start) ? null : start,
          end: Number.isNaN(end) ? null : end,
          value: minutes / 60,
        })
      }
      continue
    }

    const day = dayOf(data.date, options.timeZone)
    if (!day) continue
    for (const field of FIELDS) {
      if (field.schemaType !== entry.schemaType || field.notFrom?.includes(source)) continue
      const value = numberOf(data[field.field])
      if (value === null) continue
      readings.push({ metric: field.metric, day, source, value: value * (field.scale ?? 1), at })
    }
  }

  for (const event of distinctEvents(events)) {
    readings.push({ metric: event.metric, day: event.day, source: event.source, value: event.value, at: 0 })
  }

  const inRange = readings.filter(
    (reading) => (!options.from || reading.day >= options.from) && (!options.to || reading.day <= options.to)
  )
  // The last day anything was recorded, by any source, which is as far as
  // the data is known to reach.
  const covered = inRange.reduce((latest, reading) => (reading.day > latest ? reading.day : latest), '')
  const today = options.to ?? covered

  return METRICS.map((metric) => {
    const byDay = new Map<string, Map<string, Reading[]>>()
    for (const reading of inRange) {
      if (reading.metric !== metric.id) continue
      const sources = byDay.get(reading.day) ?? new Map<string, Reading[]>()
      sources.set(reading.source, [...(sources.get(reading.source) ?? []), reading])
      byDay.set(reading.day, sources)
    }
    const days: DayValue[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sources]) => {
        const ranked = [...sources.keys()].sort(bySourcePriority)
        const chosen = ranked[0]
        // Events were matched already, so every source's kept ones add up.
        const values = metric.combine === 'sum' ? [...sources.values()].flat() : sources.get(chosen)!
        return { date, value: round(combine(values, metric.combine), metric.decimals), source: chosen, sources: ranked }
      })
    return { metric, days, latest: days.at(-1) ?? null, trend: today ? trendOf(metric, days, today, covered) : null }
  })
}
