import { validateSchemaData } from '../../schemas/validate'
import type { ImportedRecord } from './types'

/**
 * Drop each reading its schema refuses and keep the rest. Returns null when
 * what is left is not a record, such as a day with no reading at all. Each
 * dropped reading is counted as implausible, and a record with nothing left as
 * incomplete, so the import can say what it left out.
 */
export function keepPlausible(record: ImportedRecord, skip: (reason: string) => void): ImportedRecord | null {
  const data = { ...record.data }
  for (let attempt = 0; attempt < 8; attempt++) {
    const checked = validateSchemaData(record.schemaType, data)
    if (checked.success) return { ...record, data }
    const fields = Object.keys(checked.fieldErrors).filter((name) => name in data)
    if (fields.length === 0) break
    for (const name of fields) {
      delete data[name]
      skip('implausible')
    }
  }
  skip('incomplete')
  return null
}
