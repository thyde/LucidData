import type { VaultSchemaType } from '../../schemas/vault-schemas'

/**
 * LD-210 export readers, shared types.
 *
 * A reader turns one provider's export into typed records, each with a key
 * that stays the same however many times the same data is exported. That key
 * becomes the entry's `source_record_id`, and the vault's unique index on it is
 * what makes importing the same archive twice store nothing the second time.
 */

export interface ImportedRecord {
  schemaType: VaultSchemaType
  data: Record<string, unknown>
  /** Stable across exports of the same data. Matches SOURCE_RECORD_ID_PATTERN. */
  sourceRecordId: string
  /** When the source recorded it, as an ISO 8601 timestamp. */
  capturedAt?: string
}

export interface ExportReadResult {
  /** The provenance slug, such as `apple-health`. */
  provider: string
  /** The name people know the source by. */
  label: string
  records: ImportedRecord[]
  /** Values that could not be used, counted by reason, so the person is told rather than left to guess. */
  skipped: Record<string, number>
}

export interface ReadOptions {
  /** Called as text is read, with the number of characters read so far. */
  onProgress?: (characters: number) => void
}
