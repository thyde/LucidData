/**
 * LD-305 health summary sharing.
 *
 * A share is a snapshot of the timeline: the figures a person chose, over the
 * dates they chose, with an optional name and note. It is built and encrypted
 * on the person's device and read on the recipient's, so this module only
 * shapes and checks the data. Nothing here sends anything anywhere.
 */

import { z } from 'zod'
import { METRICS, type DayValue, type MetricId, type MetricSeries } from './timeline'

export const HEALTH_SHARE_VERSION = 1

/** How long a link may work, in days. The first is the shortest, the second the default. */
export const SHARE_EXPIRY_OPTIONS = [1, 7, 30] as const
export type ShareExpiryDays = (typeof SHARE_EXPIRY_OPTIONS)[number]
export const DEFAULT_SHARE_EXPIRY_DAYS: ShareExpiryDays = 7

/** The longest range a share covers, counting both ends. */
export const MAX_SHARE_RANGE_DAYS = 366
export const MAX_SHARE_NOTE_LENGTH = 1000
export const MAX_SHARE_NAME_LENGTH = 80
export const MAX_SHARE_LABEL_LENGTH = 80
/** The largest ciphertext the server keeps, as the database also enforces. */
export const MAX_SHARE_CIPHERTEXT_LENGTH = 1_048_576
/** Links a person may have open at once. */
export const MAX_ACTIVE_SHARES = 10

/** The recipient a share's consent names, so it can be told apart from a grant to an organization. */
export const LINK_SHARE_PREFIX = 'link:'

/** The recipient's name on a share the person did not label. */
export const ANYONE_WITH_THE_LINK = 'Anyone with the link'

export const METRIC_IDS = METRICS.map((metric) => metric.id) as [MetricId, ...MetricId[]]

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Whether text is a real calendar day written as YYYY-MM-DD. */
export function isCalendarDay(text: string): boolean {
  if (!DAY.test(text)) return false
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Days in a range, counting both ends. */
export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

/** One day of a shared series: the date, the value, and every source that recorded it, the one used first. */
export type SharedDay = [date: string, value: number, sources: string[]]

export interface SharedSeries {
  metric: MetricId
  days: SharedDay[]
}

export interface HealthShareSnapshot {
  version: typeof HEALTH_SHARE_VERSION
  createdAt: string
  from: string
  to: string
  /** The name the person chose to show, if any. */
  sharedBy: string | null
  note: string | null
  series: SharedSeries[]
}

export interface ShareSnapshotOptions {
  metrics: readonly MetricId[]
  from: string
  to: string
  sharedBy?: string | null
  note?: string | null
  now?: Date
}

function optionalText(text: string | null | undefined): string | null {
  const trimmed = text?.trim()
  return trimmed ? trimmed : null
}

/**
 * The chosen figures over the chosen dates, from a timeline already worked out
 * on the device. A figure with nothing recorded in the range is left out, so
 * the snapshot never claims to share something it does not hold.
 */
export function buildShareSnapshot(series: readonly MetricSeries[], options: ShareSnapshotOptions): HealthShareSnapshot {
  const chosen = new Set(options.metrics)
  const shared: SharedSeries[] = []
  for (const item of series) {
    if (!chosen.has(item.metric.id)) continue
    const days = item.days
      .filter((day) => day.date >= options.from && day.date <= options.to)
      .map((day): SharedDay => [day.date, day.value, day.sources.length > 0 ? [...day.sources] : [day.source]])
    if (days.length > 0) shared.push({ metric: item.metric.id, days })
  }
  return {
    version: HEALTH_SHARE_VERSION,
    createdAt: (options.now ?? new Date()).toISOString(),
    from: options.from,
    to: options.to,
    sharedBy: optionalText(options.sharedBy),
    note: optionalText(options.note),
    series: shared,
  }
}

const sharedDaySchema = z.tuple([
  z.string().refine(isCalendarDay),
  z.number().finite(),
  z.array(z.string().min(1).max(40)).min(1).max(METRICS.length * 2),
])

export const healthShareSnapshotSchema = z
  .strictObject({
    version: z.literal(HEALTH_SHARE_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    from: z.string().refine(isCalendarDay),
    to: z.string().refine(isCalendarDay),
    sharedBy: z.string().min(1).max(MAX_SHARE_NAME_LENGTH).nullable(),
    note: z.string().min(1).max(MAX_SHARE_NOTE_LENGTH).nullable(),
    series: z
      .array(z.strictObject({ metric: z.enum(METRIC_IDS), days: z.array(sharedDaySchema).min(1).max(MAX_SHARE_RANGE_DAYS) }))
      .min(1)
      .max(METRICS.length),
  })
  .refine((snapshot) => snapshot.from <= snapshot.to && rangeDays(snapshot.from, snapshot.to) <= MAX_SHARE_RANGE_DAYS, {
    message: 'The range is not valid',
  })
  .refine((snapshot) => new Set(snapshot.series.map((item) => item.metric)).size === snapshot.series.length, {
    message: 'A figure appears twice',
  })
  .refine(
    (snapshot) =>
      snapshot.series.every((item) => item.days.every(([date]) => date >= snapshot.from && date <= snapshot.to)),
    { message: 'A day falls outside the range' }
  )

/** Read a decrypted snapshot, refusing anything that is not one. */
export function parseShareSnapshot(text: string): HealthShareSnapshot {
  return healthShareSnapshotSchema.parse(JSON.parse(text)) as HealthShareSnapshot
}

/** A snapshot's figures in the shape the charts draw. Trends are left out: they would read as about today. */
export function sharedSeries(snapshot: HealthShareSnapshot): MetricSeries[] {
  return snapshot.series.flatMap((item) => {
    const metric = METRICS.find((definition) => definition.id === item.metric)
    if (!metric) return []
    const days: DayValue[] = [...item.days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value, sources]) => ({ date, value, source: sources[0], sources }))
    return [{ metric, days, latest: days.at(-1) ?? null, trend: null }]
  })
}

/** The link a recipient opens. The key goes after the #, which browsers keep to themselves. */
export function shareLink(origin: string, id: string, key: string): string {
  return `${origin.replace(/\/+$/, '')}/share/${id}#${key}`
}

/** Whether a consent is the one behind a link share. */
export function isLinkShareConsent(consent: { granted_to: string }): boolean {
  return consent.granted_to.startsWith(LINK_SHARE_PREFIX)
}
