/**
 * LD-210 health export reading: which file is which, and the readers.
 */

import { blobSource, looksLikeZip, openZip } from '../zip'
import { streamText } from '../xml-scan'
import { DETECTION_HEAD_BYTES } from '../adapters/types'
import { APPLE_HEALTH, readAppleHealth } from './apple-health'
import type { ExportReadResult } from './types'

export { APPLE_HEALTH, readAppleHealth }
export { runImport } from './runner'
export type { ImportDependencies, ImportOutcome, ImportProgress, EntryToStore, StoreAnswer } from './runner'
export type { ExportReadResult, ImportedRecord } from './types'

/** Every export this module reads, by provenance slug. The extension's walkthroughs point at these. */
export const EXPORT_READERS: readonly { id: string; label: string }[] = [
  { id: APPLE_HEALTH.provider, label: APPLE_HEALTH.label },
]

/** Apple's export declares its root element and characteristic types near the top. */
export function isAppleHealthXml(head: string): boolean {
  return head.includes('<HealthData') || head.includes('HKCharacteristicTypeIdentifier')
}

/**
 * Read a health export the person chose: Apple Health's export.zip, or the
 * export.xml inside it. Returns null for any other file, which then takes the
 * ordinary import path. Reports progress as a fraction from 0 to 1.
 */
export async function readHealthExport(
  file: Blob,
  onProgress?: (fraction: number) => void
): Promise<ExportReadResult | null> {
  const head = new Uint8Array(await file.slice(0, DETECTION_HEAD_BYTES).arrayBuffer())

  if (looksLikeZip(head)) {
    const archive = await openZip(blobSource(file))
    const entry = archive.entries.find((candidate) => /(^|\/)export\.xml$/.test(candidate.name))
    if (!entry) return null
    return readAppleHealth(archive.text(entry), {
      onProgress: (characters) => onProgress?.(Math.min(1, characters / Math.max(entry.size, 1))),
    })
  }

  if (!isAppleHealthXml(new TextDecoder().decode(head))) return null
  const text = file.stream().pipeThrough(new TextDecoderStream())
  return readAppleHealth(streamText(text), {
    onProgress: (characters) => onProgress?.(Math.min(1, characters / Math.max(file.size, 1))),
  })
}
