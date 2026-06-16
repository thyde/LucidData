'use client'

import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'

interface VaultDataDisplayProps {
  schemaType: string | null | undefined
  data: Record<string, unknown> | string | null
}

function formatFieldValue(type: string, val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (type === 'checkbox') return val ? 'Yes' : 'No'
  if (type === 'multi-text') {
    if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '—'
    return String(val)
  }
  return String(val)
}

export function VaultDataDisplay({ schemaType, data }: VaultDataDisplayProps) {
  const fields = schemaType ? SCHEMA_FORM_FIELDS[schemaType] : undefined

  if (!fields || !data || typeof data !== 'object') {
    // Fall back to raw JSON
    return (
      <pre className="bg-muted p-2 rounded overflow-x-auto text-sm">
        {data == null ? '—' : JSON.stringify(data, null, 2)}
      </pre>
    )
  }

  const record = data as Record<string, unknown>

  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {fields.map(field => {
        const val = record[field.name]
        const display = formatFieldValue(field.type, val)
        return (
          <div key={field.name} className="space-y-0.5">
            <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
            <dd className="text-sm">{display}</dd>
          </div>
        )
      })}
    </dl>
  )
}
