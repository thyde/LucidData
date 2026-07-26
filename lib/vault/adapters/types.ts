/**
 * LD-203 provider export adapters, shared types.
 *
 * OAuth connectors reach a narrow set of providers, because each one needs an
 * API and an agreement. A bulk export needs neither: every provider covered by
 * a privacy law has to offer one. That makes exports the widest acquisition
 * path available, and the only thing standing in the way is that each provider
 * writes a different file.
 *
 * An adapter turns one provider's file into the plain records the existing
 * import pipeline already accepts, so nothing downstream changes. Parsing stays
 * in the browser, which is not a preference: the file holds plaintext, and
 * uploading it to be parsed would hand over exactly what this product exists to
 * keep.
 */

import type { VaultSchemaType } from '@/lib/schemas/vault-schemas'

export interface AdapterResult {
  /** Records in the shape lib/vault/import-parsers.ts already produces. */
  records: Record<string, unknown>[]
  /**
   * The schema the adapter is confident these records fit.
   *
   * Absent means the adapter normalized the shape but will not guess the type,
   * and the existing mapping wizard should ask. Guessing wrong is worse than
   * not guessing, because a mismapped field is silently wrong rather than
   * visibly missing.
   */
  schemaType?: VaultSchemaType
  /** How many records the file held, before any limit was applied. */
  totalFound: number
  /** True when `records` is shorter than `totalFound`. */
  truncated: boolean
}

export interface ParseOptions {
  /**
   * Stop after this many records.
   *
   * Exports are frequently far larger than anyone wants to import. A limit
   * applied while scanning is what keeps a large file from becoming an
   * out-of-memory crash rather than a truncated import.
   */
  limit?: number
}

export interface ExportAdapter {
  id: string
  label: string
  /**
   * Whether this adapter recognises the file.
   *
   * Given the name and a leading slice of the text rather than the whole file,
   * so detection stays cheap on a very large export.
   */
  detect(fileName: string, head: string): boolean
  parse(text: string, options?: ParseOptions): AdapterResult
}

/** How much of a file is enough to recognise it. */
export const DETECTION_HEAD_BYTES = 64 * 1024
