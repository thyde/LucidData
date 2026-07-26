/**
 * LD-203 adapter registry.
 *
 * Detection is ordered and first-match-wins, so the adapters run from most
 * specific to least. An unrecognised file returns null and the caller falls
 * back to the existing mapping wizard, which is the behaviour that keeps this
 * feature additive: a file that no adapter understands imports exactly as well
 * as it did before.
 */

import { DETECTION_HEAD_BYTES, type AdapterResult, type ExportAdapter } from './types'
import { appleHealthAdapter } from './apple-health'
import { googleTakeoutAdapter } from './google-takeout'
import { bankCsvAdapter } from './bank-csv'

export const EXPORT_ADAPTERS: ExportAdapter[] = [
  appleHealthAdapter,
  googleTakeoutAdapter,
  bankCsvAdapter,
]

export type { AdapterResult, ExportAdapter } from './types'
export { appleHealthAdapter, googleTakeoutAdapter, bankCsvAdapter }

/** The adapter that recognises this file, or null to use the generic path. */
export function detectAdapter(fileName: string, text: string): ExportAdapter | null {
  const head = text.slice(0, DETECTION_HEAD_BYTES)
  return EXPORT_ADAPTERS.find((adapter) => adapter.detect(fileName, head)) ?? null
}

export interface AdaptedImport extends AdapterResult {
  adapterId: string
  adapterLabel: string
}

/**
 * Parse with whichever adapter recognises the file.
 *
 * Returns null rather than throwing when nothing matches, because "no adapter"
 * is the normal case for most files and not an error. A malformed file that an
 * adapter did claim is a real failure and does throw, so the caller can say so.
 */
export function parseWithAdapter(
  fileName: string,
  text: string,
  options?: { limit?: number }
): AdaptedImport | null {
  const adapter = detectAdapter(fileName, text)
  if (!adapter) return null

  const result = adapter.parse(text, options)
  return { ...result, adapterId: adapter.id, adapterLabel: adapter.label }
}
