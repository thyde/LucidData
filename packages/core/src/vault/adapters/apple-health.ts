/**
 * LD-203 Apple Health export adapter.
 *
 * Apple Health exports a single `export.xml` inside a zip. Two element types
 * matter: `Workout`, which is one activity, and `Record`, which is one sample
 * of one quantity and arrives in enormous numbers.
 *
 * Parsed by scanning rather than through DOMParser, and that is a size decision
 * rather than a stylistic one. A year of Apple Health data is routinely
 * hundreds of megabytes and tens of millions of elements. Building a DOM of
 * that runs the tab out of memory before any of it reaches the vault. Scanning
 * lets the limit apply while reading, so a large file is truncated rather than
 * fatal.
 *
 * Apple's export is machine-generated with a fixed element shape, which is what
 * makes attribute scanning safe here. It would not be safe on arbitrary XML.
 */

import type { AdapterResult, ExportAdapter, ParseOptions } from './types'

/** Map Apple's workout type constants onto the sport types our schema allows. */
const WORKOUT_TYPE_MAP: Record<string, string> = {
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

function sportType(raw: string): string {
  const key = raw.replace(/^HKWorkoutActivityType/, '').toLowerCase()
  return WORKOUT_TYPE_MAP[key] ?? 'Other'
}

/**
 * Pull attributes out of one element's opening tag.
 *
 * Handles the double-quoted attributes Apple emits, and decodes the five XML
 * entities that can appear in an attribute value.
 */
function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1]] = decodeEntities(match[2])
  }
  return attributes
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Apple writes dates as `2026-01-15 08:30:00 -0800`. Keep the calendar day only
 * for daily aggregates, since a timezone-shifted timestamp would split one
 * person's day across two.
 */
function calendarDay(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match ? match[1] : undefined
}

function toKilometres(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const u = (unit ?? 'km').toLowerCase()
  if (u === 'km') return round(value)
  if (u === 'mi') return round(value * 1.609344)
  if (u === 'm') return round(value / 1000)
  return round(value)
}

function toMinutes(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const u = (unit ?? 'min').toLowerCase()
  if (u === 'min') return round(value)
  if (u === 'sec' || u === 's') return round(value / 60)
  if (u === 'hour' || u === 'hr' || u === 'h') return round(value * 60)
  return round(value)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Quantity types worth aggregating into a daily summary. */
const DAILY_QUANTITIES: Record<string, keyof DailyTotals> = {
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierDistanceWalkingRunning: 'distance_km',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'calories_out',
  HKQuantityTypeIdentifierFlightsClimbed: 'floors',
  HKQuantityTypeIdentifierAppleExerciseTime: 'active_minutes',
}

interface DailyTotals {
  steps: number
  distance_km: number
  calories_out: number
  floors: number
  active_minutes: number
}

function scanWorkouts(text: string, limit: number): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  const pattern = /<Workout\b([^>]*)>/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (records.length >= limit) break
    const a = readAttributes(match[1])
    const start = a.startDate
    if (!start) continue

    records.push({
      name: a.workoutActivityType
        ? sportType(a.workoutActivityType).concat(' workout')
        : 'Workout',
      sport_type: sportType(a.workoutActivityType ?? ''),
      start_date: start,
      duration_min: toMinutes(toNumber(a.duration), a.durationUnit),
      distance_km: toKilometres(toNumber(a.totalDistance), a.totalDistanceUnit),
      calories: toNumber(a.totalEnergyBurned),
      source: a.sourceName ?? 'Apple Health',
    })
  }

  return records
}

function scanDailyTotals(text: string, limit: number): Record<string, unknown>[] {
  const byDay = new Map<string, Partial<DailyTotals>>()
  const pattern = /<Record\b([^>]*)>/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const a = readAttributes(match[1])
    const field = a.type ? DAILY_QUANTITIES[a.type] : undefined
    if (!field) continue

    const day = calendarDay(a.startDate)
    const value = toNumber(a.value)
    if (!day || value === undefined) continue

    // Stop collecting new days once the limit is reached, but keep adding to
    // days already seen so a truncated import still has complete totals.
    if (!byDay.has(day)) {
      if (byDay.size >= limit) continue
      byDay.set(day, {})
    }
    const totals = byDay.get(day)!
    totals[field] = (totals[field] ?? 0) + value
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date,
      steps: totals.steps === undefined ? undefined : Math.round(totals.steps),
      distance_km: totals.distance_km === undefined ? undefined : round(totals.distance_km),
      calories_out:
        totals.calories_out === undefined ? undefined : Math.round(totals.calories_out),
      floors: totals.floors === undefined ? undefined : Math.round(totals.floors),
      active_minutes:
        totals.active_minutes === undefined ? undefined : Math.round(totals.active_minutes),
      source: 'Apple Health',
    }))
}

export const appleHealthAdapter: ExportAdapter = {
  id: 'apple-health',
  label: 'Apple Health',

  detect(fileName, head) {
    const name = fileName.toLowerCase()
    if (!name.endsWith('.xml')) return false
    // The DTD name is the reliable marker. A filename alone is not, because
    // people rename exports.
    return head.includes('<HealthData') || head.includes('HKCharacteristicTypeIdentifier')
  },

  parse(text, options: ParseOptions = {}): AdapterResult {
    const limit = options.limit ?? 1000

    // Workouts are the more useful record and there are far fewer of them, so
    // they win when a file contains both.
    const workouts = scanWorkouts(text, limit)
    if (workouts.length > 0) {
      const total = (text.match(/<Workout\b/g) ?? []).length
      return {
        records: workouts,
        schemaType: 'fitness_activity',
        totalFound: total,
        truncated: total > workouts.length,
      }
    }

    const daily = scanDailyTotals(text, limit)
    return {
      records: daily,
      schemaType: daily.length > 0 ? 'fitness_daily' : undefined,
      totalFound: daily.length,
      truncated: false,
    }
  },
}
