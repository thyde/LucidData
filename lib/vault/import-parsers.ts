// Client-side parsers for file import. Everything here runs in the browser so the
// file's plaintext is parsed and then encrypted locally; nothing is uploaded in
// the clear. Each parser turns a file's text into a list of plain record objects,
// one per vault entry.

export type ImportFormat = 'json' | 'csv'

export interface ParsedImport {
  records: Record<string, unknown>[]
  format: ImportFormat
}

function asRecord(item: unknown): Record<string, unknown> {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return item as Record<string, unknown>
  }
  return { value: item }
}

// Parse JSON into a list of records. An array becomes one record per element; an
// object with a `records` or `items` array uses that; any other object is a single
// record.
export function parseJsonImport(text: string): Record<string, unknown>[] {
  const data: unknown = JSON.parse(text)

  if (Array.isArray(data)) {
    return data.map(asRecord)
  }

  if (data && typeof data === 'object') {
    const container = data as Record<string, unknown>
    const nested = container.records ?? container.items
    if (Array.isArray(nested)) {
      return nested.map(asRecord)
    }
    return [container]
  }

  return [{ value: data }]
}

// Tokenize CSV text into rows of fields. Handles quoted fields, escaped quotes
// (""), and commas or newlines inside quotes (RFC 4180 style).
export function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field)
  rows.push(row)

  // Drop a trailing empty row produced by a final newline.
  const last = rows[rows.length - 1]
  if (last && last.length === 1 && last[0] === '') rows.pop()

  return rows
}

// Parse CSV into records using the first row as headers. Blank lines are skipped;
// missing headers fall back to column_N.
export function parseCsv(text: string): Record<string, unknown>[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []

  const headers = rows[0].map((h, i) => h.trim() || `column_${i + 1}`)
  const records: Record<string, unknown>[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.length === 1 && row[0].trim() === '') continue
    const record: Record<string, unknown> = {}
    headers.forEach((header, i) => {
      record[header] = row[i] ?? ''
    })
    records.push(record)
  }

  return records
}

// Parse a file's text by extension, falling back to JSON then CSV when the name is
// not decisive.
export function parseImportFile(fileName: string, text: string): ParsedImport {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.json')) {
    return { records: parseJsonImport(text), format: 'json' }
  }
  if (lower.endsWith('.csv')) {
    return { records: parseCsv(text), format: 'csv' }
  }

  try {
    return { records: parseJsonImport(text), format: 'json' }
  } catch {
    return { records: parseCsv(text), format: 'csv' }
  }
}

// Pick a human label for a record, preferring a name-like field, else a fallback.
export function labelForRecord(
  record: Record<string, unknown>,
  fallback: string
): string {
  const candidate = record.label ?? record.name ?? record.title ?? record.id
  const text = candidate == null ? '' : String(candidate).trim()
  return text || fallback
}
