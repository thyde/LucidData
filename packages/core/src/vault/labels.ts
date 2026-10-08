import { VAULT_SCHEMA_TYPES } from '../schemas/vault-schemas'

/**
 * Labels for entries the app imports or syncs, and the line that tells them
 * apart.
 *
 * A label is stored in the clear, so the server can list entries without
 * opening them. A provider's own name for a record is free text that often
 * names places and people (LD-501 classifies a workout's name as an
 * identifier), so it never becomes a label. The label says only what the
 * server already knows from the entry's schema type, and the record's own name
 * and date are shown from its decrypted data instead.
 */

/** The longest label the server accepts. */
export const MAX_LABEL_LENGTH = 100

/** The label for an entry the app imported or synced: its type, and nothing from inside it. */
export function importedEntryLabel(schemaType: string | null | undefined): string {
  if (!schemaType || schemaType === 'custom') return 'Imported record'
  return VAULT_SCHEMA_TYPES[schemaType as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? 'Imported record'
}

/** Text for a label, cut to the length the server accepts. */
export function fitLabel(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > MAX_LABEL_LENGTH ? trimmed.slice(0, MAX_LABEL_LENGTH).trimEnd() : trimmed
}

const DAY = /^(\d{4}-\d{2}-\d{2})/

function dayOf(value: unknown): string | null {
  return typeof value === 'string' ? (DAY.exec(value.trim())?.[1] ?? null) : null
}

/**
 * One line describing a decrypted record: its name and the day it covers, when
 * it has them. Built in the browser from the decrypted data and only ever shown
 * to the person.
 */
export function recordSummary(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const day =
    dayOf(record.date) ?? dayOf(record.start) ?? dayOf(record.start_date) ?? dayOf(record.period_end)
  const parts = [name, day].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(', ') : null
}
