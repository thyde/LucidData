import { importedEntryLabel } from '../vault/labels'

/** A queued record as the server lists it: identifiers and placeholders, never content. */
export interface PendingIngestRecord {
  category: string
  schema_type: string
  provider: string | null
  provider_record_id: string | null
  captured_at: string | null
}

/** What a queued record becomes: the vault entry to encrypt and store. */
export interface IngestedEntry {
  label: string
  category: string
  schema_type: string
  data: Record<string, unknown>
  source_provider?: string
  source_record_id?: string
  source_captured_at?: string
}

/**
 * LD-201: turn a queued record, once opened, into the vault entry it becomes.
 *
 * The worker seals the provider's name for the record (`__label`) together
 * with the record, because that name is free text. It stays encrypted: it moves
 * into the data as `name` when the record has no name of its own, and the
 * entry's label, which is stored in the clear, comes from the type alone.
 */
export function entryFromIngested(record: PendingIngestRecord, plaintext: string): IngestedEntry {
  const opened: unknown = JSON.parse(plaintext)
  if (!opened || typeof opened !== 'object' || Array.isArray(opened)) {
    throw new Error('A queued record did not open to an object')
  }
  const { __label: sealedLabel, ...payload } = opened as Record<string, unknown>
  const data =
    typeof sealedLabel === 'string' && sealedLabel.trim() !== '' && payload.name === undefined
      ? { ...payload, name: sealedLabel }
      : payload

  return {
    label: importedEntryLabel(record.schema_type),
    category: record.category,
    schema_type: record.schema_type,
    data,
    // LD-202 provenance. Identifiers only, so it can sit outside the envelope
    // and still answer "where did this come from".
    ...(record.provider ? { source_provider: record.provider } : {}),
    ...(record.provider && record.provider_record_id
      ? { source_record_id: record.provider_record_id }
      : {}),
    ...(record.captured_at ? { source_captured_at: record.captured_at } : {}),
  }
}
