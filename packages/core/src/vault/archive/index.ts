/**
 * LD-210 health export reading: which file is which, and the readers.
 */

import { blobSource, looksLikeZip, openZip, type ZipArchive, type ZipEntry } from '../zip'
import { streamText } from '../xml-scan'
import { DETECTION_HEAD_BYTES } from '../adapters/types'
import { APPLE_HEALTH, readAppleHealth } from './apple-health'
import { STRAVA, isStravaActivities, readStravaActivities } from './strava'
import { GARMIN, GARMIN_FAMILIES, isGarminExport, readGarmin } from './garmin'
import type { ExportReadResult } from './types'

export { APPLE_HEALTH, readAppleHealth }
export { STRAVA, readStravaActivities }
export { GARMIN, readGarmin }
export { runImport } from './runner'
export type { ImportDependencies, ImportOutcome, ImportProgress, EntryToStore, StoreAnswer } from './runner'
export type { ExportReadResult, ImportedRecord } from './types'

/** Every export this module reads, by provenance slug. The extension's walkthroughs point at these. */
export const EXPORT_READERS: readonly { id: string; label: string }[] = [
  { id: APPLE_HEALTH.provider, label: APPLE_HEALTH.label },
  { id: STRAVA.provider, label: STRAVA.label },
  { id: GARMIN.provider, label: GARMIN.label },
]

/** The most one CSV or JSON file in an export may hold, far more than a person records. */
const STRAVA_CSV_LIMIT = 64 * 1024 * 1024
const JSON_FILE_LIMIT = 64 * 1024 * 1024

/** Garmin's JSON families, read file by file. */
async function readGarminArchive(
  archive: ZipArchive,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<ExportReadResult> {
  const groups = { activities: [] as ZipEntry[], days: [] as ZipEntry[], sleep: [] as ZipEntry[] }
  for (const entry of archive.entries) {
    if (entry.isDirectory) continue
    for (const family of Object.keys(groups) as (keyof typeof groups)[]) {
      if (GARMIN_FAMILIES[family].test(entry.name)) groups[family].push(entry)
    }
  }
  const total = groups.activities.length + groups.days.length + groups.sleep.length
  let done = 0
  const texts = async (entries: ZipEntry[]) => {
    const out: string[] = []
    for (const entry of entries) {
      signal?.throwIfAborted()
      out.push(await archive.readText(entry, JSON_FILE_LIMIT))
      onProgress?.(++done / Math.max(total, 1))
    }
    return out
  }
  return readGarmin(
    { activities: await texts(groups.activities), days: await texts(groups.days), sleep: await texts(groups.sleep) },
    { signal }
  )
}

/** Apple's export declares its root element and characteristic types near the top. */
export function isAppleHealthXml(head: string): boolean {
  return head.includes('<HealthData') || head.includes('HKCharacteristicTypeIdentifier')
}

/** The start of an entry, enough to tell what it is, without unpacking the rest. */
async function entryHead(archive: ZipArchive, entry: ZipEntry): Promise<string> {
  let head = ''
  for await (const part of archive.text(entry)) {
    head += part
    if (head.length >= DETECTION_HEAD_BYTES) break
  }
  return head.slice(0, DETECTION_HEAD_BYTES)
}

/**
 * The export inside Apple's zip. It is export.xml in English, but the name
 * follows the phone's language, such as eksport.xml in Norwegian, so the XML
 * files are tried by what they hold. export_cda.xml, the clinical document
 * beside it, starts differently and is passed over.
 */
async function findAppleExport(archive: ZipArchive): Promise<ZipEntry | null> {
  const depth = (entry: ZipEntry) => entry.name.split('/').length
  const candidates = archive.entries
    .filter((entry) => !entry.isDirectory && /\.xml$/i.test(entry.name))
    .sort(
      (a, b) =>
        Number(!/(^|\/)export\.xml$/.test(a.name)) - Number(!/(^|\/)export\.xml$/.test(b.name)) ||
        Number(/_cda\.xml$/i.test(a.name)) - Number(/_cda\.xml$/i.test(b.name)) ||
        depth(a) - depth(b)
    )
    .slice(0, 6)
  for (const entry of candidates) {
    if (isAppleHealthXml(await entryHead(archive, entry))) return entry
  }
  return null
}

/** Strava's archive keeps activities.csv at its root. */
async function findStravaActivities(archive: ZipArchive): Promise<ZipEntry | null> {
  const entry = archive.entries
    .filter((candidate) => !candidate.isDirectory && /(^|\/)activities\.csv$/i.test(candidate.name))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0]
  return entry && isStravaActivities(await entryHead(archive, entry)) ? entry : null
}

/**
 * Read a health export the person chose: Apple Health's export.zip or the
 * export.xml inside it, Strava's account archive or the activities.csv inside
 * it, or Garmin's data export. Returns null for any other file, which then
 * takes the ordinary import path. Reports progress as a fraction from 0 to 1,
 * and stops with the signal's reason when it is aborted.
 */
export async function readHealthExport(
  file: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<ExportReadResult | null> {
  const head = new Uint8Array(await file.slice(0, DETECTION_HEAD_BYTES).arrayBuffer())

  if (looksLikeZip(head)) {
    const archive = await openZip(blobSource(file))
    const entry = await findAppleExport(archive)
    if (entry) {
      return readAppleHealth(archive.text(entry), {
        onProgress: (characters) => onProgress?.(Math.min(1, characters / Math.max(entry.size, 1))),
        signal,
      })
    }
    const activities = await findStravaActivities(archive)
    if (activities) {
      const result = readStravaActivities(await archive.readText(activities, STRAVA_CSV_LIMIT), { signal })
      onProgress?.(1)
      return result
    }
    if (isGarminExport(archive.entries.map((candidate) => candidate.name))) {
      return readGarminArchive(archive, onProgress, signal)
    }
    return null
  }

  const start = new TextDecoder().decode(head)
  if (isStravaActivities(start)) {
    if (file.size > STRAVA_CSV_LIMIT) return null
    const result = readStravaActivities(await file.text(), { signal })
    onProgress?.(1)
    return result
  }

  if (!isAppleHealthXml(start)) return null
  const text = file.stream().pipeThrough(new TextDecoderStream())
  return readAppleHealth(streamText(text), {
    onProgress: (characters) => onProgress?.(Math.min(1, characters / Math.max(file.size, 1))),
    signal,
  })
}
