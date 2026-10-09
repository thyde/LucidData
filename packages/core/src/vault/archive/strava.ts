/**
 * LD-210 Strava reader.
 *
 * Strava's "Download your account" archive holds activities.csv at its root:
 * one row per activity, under a header that repeats some names. Where a name
 * repeats, the first column is formatted for display in the person's own
 * units, such as 4.55 km or "1,000" m for a swim, and the last is raw, in
 * metres and seconds. Only the raw ones are read. Activity Date is in UTC.
 *
 * Records are keyed the way the Strava connector keys them, provider `strava`
 * and the activity id, and hold the same fields, so an activity brought in
 * from the archive is the same entry a sync would store, and neither path adds
 * it twice.
 */

import { normalizeStravaActivity, type StravaActivity } from '../../connectors/fitness'
import { parseCsvRows } from '../import-parsers'
import { keepPlausible } from './plausible'
import type { ExportReadResult, ImportedRecord } from './types'

export const STRAVA = { provider: 'strava', label: 'Strava' } as const

/** activities.csv starts with these columns. */
export function isStravaActivities(head: string): boolean {
  return /^\uFEFF?"?Activity ID"?,"?Activity Date"?,/.test(head)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DISPLAY_DATE = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)$/
const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/

function utc(year: number, month: number, day: number, hour: number, minute: number, second: number): string | null {
  const ms = Date.UTC(year, month, day, hour, minute, second)
  const date = new Date(ms)
  // Date.UTC rolls 31 February into March rather than refusing it.
  if (Number.isNaN(ms) || date.getUTCDate() !== day || date.getUTCMonth() !== month) return null
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Strava writes `Aug 24, 2024, 10:47:26 AM`, in UTC. Returns an ISO timestamp, or null. */
export function parseStravaDate(value: string): string | null {
  const text = value.trim()
  const display = DISPLAY_DATE.exec(text)
  if (display) {
    const month = MONTHS.indexOf(display[1])
    const hour = Number(display[4])
    if (month < 0 || hour < 1 || hour > 12) return null
    return utc(Number(display[3]), month, Number(display[2]), (hour % 12) + (display[7] === 'PM' ? 12 : 0), Number(display[5]), Number(display[6]))
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
  const column = columnsOf(header)
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

  return { ...STRAVA, records, skipped }
}
