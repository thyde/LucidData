/**
 * LD-210 Strava reader.
 *
 * Strava's "Download your account" archive holds activities.csv at its root:
 * one row per activity, under a header that repeats some names. Where a name
 * repeats, the first column is formatted for display in the person's own
 * units, such as 4.55 km or "1,000" m for a swim, and the last is raw, in
 * metres and seconds. Only the raw ones are read. Activity Date is in UTC.
 *
 * Records hold the fields the Strava connector stores and the same key, the
 * activity id, under their own provider, `strava-archive`, so disconnecting
 * Strava and deleting what it synced leaves an imported history alone. Both
 * paths check both providers before storing, so an activity is kept once.
 *
 * Strava writes the header in the account's language, and the dates too. The
 * columns come in the same order whatever the language, and the names that
 * repeat do so at the same places, so that pattern identifies the file and
 * says which column is which. Dates in another language cannot be read yet,
 * and the result says so.
 */

import { normalizeStravaActivity, type StravaActivity } from '../../connectors/fitness'
import { parseCsvRows } from '../import-parsers'
import { keepPlausible } from './plausible'
import type { ExportReadResult, ImportedRecord } from './types'

export const STRAVA = { provider: 'strava-archive', label: 'Strava' } as const

/**
 * Where the current layout repeats a column name, as [first, second] indexes:
 * Elapsed Time, Distance, Max Heart Rate, Relative Effort, and Commute.
 */
const REPEATED_COLUMNS: [number, number][] = [
  [5, 15],
  [6, 17],
  [7, 30],
  [8, 37],
  [9, 50],
]

/** The columns the reader takes, by position in the current layout. */
const POSITIONS = { id: 0, date: 1, name: 2, type: 3, moving: 16, distance: 17, averageSpeed: 19, elevation: 20, maxHeartRate: 30, averageHeartRate: 31, calories: 34 }

function cleanHeader(header: readonly string[]): string[] {
  return header.map((cell) => cell.replace(/^\uFEFF/, '').trim())
}

/** Whether a header has the current layout, in any language. */
function hasStravaLayout(header: readonly string[]): boolean {
  const cells = cleanHeader(header)
  return cells.length > 50 && REPEATED_COLUMNS.every(([first, second]) => cells[first] !== '' && cells[first] === cells[second])
}

/** activities.csv, by its English header or by the layout of a translated one. */
export function isStravaActivities(head: string): boolean {
  if (/^\uFEFF?"?Activity ID"?,"?Activity Date"?,/.test(head)) return true
  const [header = []] = parseCsvRows(head.split('\n')[0] ?? '')
  return hasStravaLayout(header)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Month names are matched as English writes them, capitalised, so another
// language's abbreviation that happens to look alike is never read as one.
const DISPLAY_DATE = /^([A-Z][a-z]{2,3}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2}) ?([AaPp][Mm])$/
// The same moment written day first, as British and Australian English do, on either clock.
const DAY_FIRST_DATE = /^(\d{1,2}) ([A-Z][a-z]{2,3}) (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})(?: ?([AaPp][Mm]))?$/
const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/

/** An English month abbreviation, including British English's `Sept`, as 0 to 11, or -1. */
function monthIndex(name: string): number {
  return name === 'Sept' ? 8 : MONTHS.indexOf(name)
}

/** An hour on a 12-hour clock with its half of the day, on a 24-hour clock, or -1. */
function hourOfDay(hour: number, half: string | undefined): number {
  if (!half) return hour <= 23 ? hour : -1
  if (hour < 1 || hour > 12) return -1
  return (hour % 12) + (half.toUpperCase() === 'PM' ? 12 : 0)
}

function utc(year: number, month: number, day: number, hour: number, minute: number, second: number): string | null {
  const ms = Date.UTC(year, month, day, hour, minute, second)
  const date = new Date(ms)
  // Date.UTC rolls 31 February into March rather than refusing it.
  if (Number.isNaN(ms) || date.getUTCDate() !== day || date.getUTCMonth() !== month) return null
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Strava writes `Aug 24, 2024, 10:47:26 AM`, in UTC. Returns an ISO timestamp, or null. */
export function parseStravaDate(value: string): string | null {
  // Newer locale data puts a narrow no-break space before AM and PM.
  const text = value.replace(/\s+/gu, ' ').trim()
  const display = DISPLAY_DATE.exec(text)
  if (display) {
    const month = monthIndex(display[1])
    const hour = hourOfDay(Number(display[4]), display[7])
    if (month < 0 || hour < 0) return null
    return utc(Number(display[3]), month, Number(display[2]), hour, Number(display[5]), Number(display[6]))
  }
  const dayFirst = DAY_FIRST_DATE.exec(text)
  if (dayFirst) {
    const month = monthIndex(dayFirst[2])
    const hour = hourOfDay(Number(dayFirst[4]), dayFirst[7])
    if (month < 0 || hour < 0) return null
    return utc(Number(dayFirst[3]), month, Number(dayFirst[1]), hour, Number(dayFirst[5]), Number(dayFirst[6]))
  }
  const plain = PLAIN_DATE.exec(text)
  if (plain) {
    const [year, month, day, hour, minute, second] = plain.slice(1).map(Number)
    return utc(year, month - 1, day, hour, minute, second)
  }
  return null
}

function number(cell: string | undefined): number | undefined {
  const text = cell?.trim()
  if (!text) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

interface Columns {
  id?: number
  date?: number
  name?: number
  type?: number
  distance?: number
  moving?: number
  elevation?: number
  averageHeartRate?: number
  maxHeartRate?: number
  calories?: number
  averageSpeed?: number
}

function columnsOf(header: string[]): Columns {
  const all = (name: string) =>
    header.flatMap((cell, index) => (cell.replace(/^\uFEFF/, '').trim() === name ? [index] : []))
  const first = (name: string) => all(name)[0]
  const last = (name: string) => all(name).at(-1)
  return {
    id: first('Activity ID'),
    date: first('Activity Date'),
    name: first('Activity Name'),
    type: first('Activity Type'),
    // With one Distance column there is no telling whether it holds km or miles.
    distance: all('Distance').length > 1 ? last('Distance') : undefined,
    moving: last('Moving Time'),
    elevation: last('Elevation Gain'),
    averageHeartRate: last('Average Heart Rate'),
    maxHeartRate: last('Max Heart Rate'),
    calories: last('Calories'),
    averageSpeed: last('Average Speed'),
  }
}

/** Read activities.csv, given as text. */
export function readStravaActivities(text: string, options: { signal?: AbortSignal } = {}): ExportReadResult {
  options.signal?.throwIfAborted()
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }

  const [header = [], ...rows] = parseCsvRows(text)
  const english = cleanHeader(header)[0] === 'Activity ID'
  const column: Columns = english ? columnsOf(header) : hasStravaLayout(header) ? POSITIONS : {}
  const at = (row: string[], index: number | undefined) => (index === undefined ? undefined : row[index])

  const byId = new Map<string, ImportedRecord>()
  for (const row of rows) {
    if (row.length === 1 && row[0].trim() === '') continue
    const id = at(row, column.id)?.trim() ?? ''
    const start = parseStravaDate(at(row, column.date) ?? '')
    if (!/^\d+$/.test(id) || !start) {
      skip('unreadable')
      continue
    }
    const activity: StravaActivity = {
      name: at(row, column.name)?.trim() || undefined,
      sport_type: (at(row, column.type) ?? '').replace(/[^A-Za-z]/g, '') || undefined,
      start_date: start,
      distance: number(at(row, column.distance)),
      moving_time: number(at(row, column.moving)),
      total_elevation_gain: number(at(row, column.elevation)),
      average_heartrate: number(at(row, column.averageHeartRate)),
      max_heartrate: number(at(row, column.maxHeartRate)),
      calories: number(at(row, column.calories)),
      average_speed: number(at(row, column.averageSpeed)),
    }
    byId.set(id, {
      schemaType: 'fitness_activity',
      data: normalizeStravaActivity(activity),
      sourceRecordId: id,
      capturedAt: start,
    })
  }

  const records = [...byId.values()]
    .map((record) => keepPlausible(record, skip))
    .filter((record): record is ImportedRecord => record !== null)
    .sort((a, b) => Date.parse(a.capturedAt ?? '') - Date.parse(b.capturedAt ?? '') || 0)

  // Dates are read only in English. In a translated archive some months can
  // still look English, so one that cannot be read means the rest are guesses
  // too, and none of it is imported rather than part of it.
  if (!english && (skipped.unreadable ?? 0) > 0) {
    return {
      ...STRAVA,
      records: [],
      skipped: { unreadable: rows.filter((row) => !(row.length === 1 && row[0].trim() === '')).length },
      hint: 'This archive is in a language LucidData cannot read yet. Set Strava to English (US), request a new archive, and import that.',
    }
  }
  const result: ExportReadResult = { ...STRAVA, records, skipped }
  if (records.length === 0 && (skipped.unreadable ?? 0) > 0) {
    result.hint =
      'LucidData could not read the dates in this archive. Set Strava to English (US), request a new archive, and import that.'
  }
  return result
}
