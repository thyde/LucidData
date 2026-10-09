/**
 * LD-210 Garmin reader.
 *
 * Garmin's "Export Your Data" archive holds JSON under DI_CONNECT. This reads
 * three families of it:
 * - DI-Connect-Fitness/*summarizedActivities.json: one entry per workout,
 *   wrapped as [{ summarizedActivitiesExport: [...] }]. Distance and elevation
 *   are in centimetres, durations in milliseconds, and calories in kilojoules.
 * - DI-Connect-Aggregator/UDSFile_*.json: one summary per calendar day, with
 *   steps, distance in metres, active calories in kilocalories, intensity
 *   minutes, resting heart rate, and blood oxygen as a percentage.
 * - DI-Connect-Wellness/*sleepData.json: one night per entry, with each stage
 *   in seconds and the window as GMT timestamps.
 *
 * The last day in the export covers less than a day when the export was made
 * before it ended, so that day is left out: a record's key never changes, and
 * storing it now would make a later export skip the full day. Earlier days are
 * kept whatever they cover, since a short one there is a day without the watch.
 *
 * Units come from parsers checked against real exports and the same workouts
 * on Strava; see docs/competitive-feature-roadmap.md, LD-210.
 */

import { round } from './units'
import { keepPlausible } from './plausible'
import type { ExportReadResult, ImportedRecord } from './types'

export const GARMIN = { provider: 'garmin', label: 'Garmin' } as const

/** Shorter than any whole day, even the one a clock change shortens. */
const WHOLE_DAY_MS = 23 * 60 * 60 * 1000
const KILOJOULES_PER_KILOCALORIE = 4.184

export const GARMIN_FAMILIES = {
  activities: /(^|\/)DI-Connect-Fitness\/[^/]*summarizedActivities[^/]*\.json$/i,
  days: /(^|\/)DI-Connect-Aggregator\/UDSFile_[^/]*\.json$/i,
  sleep: /(^|\/)DI-Connect-Wellness\/[^/]*sleepData[^/]*\.json$/i,
} as const

/** Whether an archive's file names are Garmin's. */
export function isGarminExport(names: readonly string[]): boolean {
  return names.some((name) => Object.values(GARMIN_FAMILIES).some((pattern) => pattern.test(name)))
}

type Json = Record<string, unknown>

const numberOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function utcSecond(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Garmin's GMT timestamps come as epoch milliseconds or as ISO text without a zone. */
function gmt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/.exec(value.trim())
  if (!match) return undefined
  const ms = Date.parse(`${match[1]}T${match[2]}Z`)
  return Number.isNaN(ms) ? undefined : ms
}

const SPORTS: [RegExp, string][] = [
  [/run/, 'Run'],
  [/cycl|bik|ride/, 'Ride'],
  [/swim/, 'Swim'],
  [/hik/, 'Hike'],
  [/walk/, 'Walk'],
  [/strength/, 'WeightTraining'],
  [/yoga/, 'Yoga'],
  [/hiit|cardio|fitness_equipment/, 'Workout'],
]

export function garminSport(type: unknown): string {
  const key = typeof type === 'string' ? type.toLowerCase() : ''
  return SPORTS.find(([pattern]) => pattern.test(key))?.[1] ?? 'Other'
}

function activityRecord(activity: Json): ImportedRecord | null {
  const id = activity.activityId
  const start = gmt(activity.beginTimestamp ?? activity.startTimeGmt ?? activity.startTimeGMT)
  if ((typeof id !== 'number' && typeof id !== 'string') || !/^\d+$/.test(String(id)) || start === undefined) {
    return null
  }
  const sport = garminSport(activity.activityType)
  const data: Record<string, unknown> = {
    name: typeof activity.name === 'string' && activity.name.trim() ? activity.name.trim() : `${sport} workout`,
    sport_type: sport,
    start_date: utcSecond(start),
  }
  const duration = numberOf(activity.movingDuration) ?? numberOf(activity.duration)
  if (duration !== undefined) data.duration_min = round(duration / 60000, 1)
  const distance = numberOf(activity.distance)
  if (distance !== undefined && distance > 0) data.distance_km = round(distance / 100000, 2)
  const elevation = numberOf(activity.elevationGain)
  if (elevation !== undefined) data.elevation_gain_m = round(elevation / 100, 1)
  const average = numberOf(activity.avgHr) ?? numberOf(activity.averageHR)
  if (average !== undefined) data.average_heartrate = Math.round(average)
  const maximum = numberOf(activity.maxHr) ?? numberOf(activity.maxHR)
  if (maximum !== undefined) data.max_heartrate = Math.round(maximum)
  const energy = numberOf(activity.calories)
  if (energy !== undefined) data.calories = Math.round(energy / KILOJOULES_PER_KILOCALORIE)
  data.source = GARMIN.label
  return { schemaType: 'fitness_activity', data, sourceRecordId: String(id), capturedAt: utcSecond(start) }
}

function dayRecords(day: Json): ImportedRecord[] {
  const date = typeof day.calendarDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.calendarDate) ? day.calendarDate : null
  if (!date) return []
  const end = gmt(day.wellnessEndTimeGmt)
  const capturedAt = end === undefined ? undefined : utcSecond(end)
  const records: ImportedRecord[] = []

  const activity: Record<string, unknown> = { date }
  const steps = numberOf(day.totalSteps)
  if (steps !== undefined) activity.steps = Math.round(steps)
  const metres = numberOf(day.totalDistanceMeters)
  if (metres !== undefined) activity.distance_km = round(metres / 1000, 2)
  const active = numberOf(day.activeKilocalories)
  if (active !== undefined) activity.calories_out = Math.round(active)
  const moderate = numberOf(day.moderateIntensityMinutes)
  const vigorous = numberOf(day.vigorousIntensityMinutes)
  if (moderate !== undefined || vigorous !== undefined) activity.active_minutes = Math.round((moderate ?? 0) + (vigorous ?? 0))
  if (Object.keys(activity).length > 1) {
    activity.source = GARMIN.label
    records.push({ schemaType: 'fitness_daily', data: activity, sourceRecordId: `fitness_daily:${date}`, capturedAt })
  }

  const vitals: Record<string, unknown> = { date }
  const resting = numberOf(day.restingHeartRate) ?? numberOf(day.currentDayRestingHeartRate)
  if (resting !== undefined && resting > 0) vitals.resting_heart_rate = Math.round(resting)
  const oxygen = numberOf(day.averageSpo2Value)
  if (oxygen !== undefined && oxygen > 0) vitals.blood_oxygen_pct = round(oxygen, 1)
  if (Object.keys(vitals).length > 1) {
    vitals.source = GARMIN.label
    records.push({ schemaType: 'vitals_daily', data: vitals, sourceRecordId: `vitals_daily:${date}`, capturedAt })
  }
  return records
}

function sleepRecord(night: Json): ImportedRecord | null {
  const start = gmt(night.sleepStartTimestampGMT)
  const end = gmt(night.sleepEndTimestampGMT)
  if (start === undefined || end === undefined || end <= start) return null
  const minutes = (key: string) => {
    const seconds = numberOf(night[key])
    return seconds === undefined ? undefined : seconds / 60
  }
  const deep = minutes('deepSleepSeconds')
  const light = minutes('lightSleepSeconds')
  const rem = minutes('remSleepSeconds')
  const awake = minutes('awakeSleepSeconds')
  const asleep = (deep ?? 0) + (light ?? 0) + (rem ?? 0)
  if (asleep <= 0) return null

  const data: Record<string, unknown> = {
    start: utcSecond(start),
    end: utcSecond(end),
    asleep_min: Math.round(asleep),
  }
  if (awake !== undefined) data.awake_min = Math.round(awake)
  if (light !== undefined) data.light_min = Math.round(light)
  if (deep !== undefined) data.deep_min = Math.round(deep)
  if (rem !== undefined) data.rem_min = Math.round(rem)
  data.efficiency_pct = round(Math.min(100, (asleep / ((end - start) / 60000)) * 100), 1)
  data.source = GARMIN.label
  return { schemaType: 'sleep_session', data, sourceRecordId: `sleep_session:${utcSecond(start)}`, capturedAt: utcSecond(start) }
}

/** The list a file holds, whether bare or wrapped as Garmin wraps activities. */
function itemsOf(parsed: unknown, wrapper?: string): Json[] {
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const items: Json[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const wrapped = wrapper ? (item as Json)[wrapper] : undefined
    if (Array.isArray(wrapped)) items.push(...(wrapped.filter((entry) => entry && typeof entry === 'object') as Json[]))
    else items.push(item as Json)
  }
  return items
}

export interface GarminFiles {
  activities: string[]
  days: string[]
  sleep: string[]
}

/** Read the Garmin families, each given as the text of its files. */
export function readGarmin(files: GarminFiles, options: { signal?: AbortSignal } = {}): ExportReadResult {
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }
  const parse = (text: string): unknown => {
    options.signal?.throwIfAborted()
    try {
      return JSON.parse(text)
    } catch {
      skip('unreadable')
      return []
    }
  }

  const byKey = new Map<string, ImportedRecord>()
  const keep = (record: ImportedRecord | null) => {
    if (record) byKey.set(`${record.schemaType}|${record.sourceRecordId}`, record)
    else skip('unreadable')
  }

  for (const text of files.activities) {
    for (const activity of itemsOf(parse(text), 'summarizedActivitiesExport')) keep(activityRecord(activity))
  }
  const days = files.days.flatMap((text) => itemsOf(parse(text)))
  const lastDay = days.reduce<string>(
    (latest, day) => (typeof day.calendarDate === 'string' && day.calendarDate > latest ? day.calendarDate : latest),
    ''
  )
  let unfinishedDay: string | undefined
  for (const day of days) {
    const start = gmt(day.wellnessStartTimeGmt)
    const end = gmt(day.wellnessEndTimeGmt)
    const covered = numberOf(day.durationInMilliseconds) ?? (start !== undefined && end !== undefined ? end - start : undefined)
    if (day.calendarDate === lastDay && covered !== undefined && covered < WHOLE_DAY_MS) {
      unfinishedDay = lastDay
      continue
    }
    for (const record of dayRecords(day)) keep(record)
  }
  for (const text of files.sleep) {
    for (const night of itemsOf(parse(text))) keep(sleepRecord(night))
  }

  const records = [...byKey.values()]
    .map((record) => keepPlausible(record, skip))
    .filter((record): record is ImportedRecord => record !== null)
    .sort((a, b) => Date.parse(a.capturedAt ?? '') - Date.parse(b.capturedAt ?? '') || 0)

  return { ...GARMIN, records, skipped, ...(unfinishedDay ? { unfinishedDay } : {}) }
}
