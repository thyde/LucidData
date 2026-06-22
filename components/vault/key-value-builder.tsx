'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// A friendly builder for free-form ("custom") vault data: rows of named fields with
// a type, assembled into a plain object so the user never hand-writes JSON. The raw
// JSON editor remains available in the dialog as an advanced toggle.

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'list'

interface Row {
  id: string
  key: string
  type: FieldType
  value: unknown
}

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'list', label: 'List' },
]

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function inferType(value: unknown): FieldType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'list'
  return 'text'
}

function emptyRow(): Row {
  return { id: newId(), key: '', type: 'text', value: '' }
}

function rowsFromValue(value: Record<string, unknown>): Row[] {
  const entries = Object.entries(value ?? {})
  if (entries.length === 0) return [emptyRow()]
  return entries.map(([key, v]) => ({ id: newId(), key, type: inferType(v), value: v }))
}

function defaultValueFor(type: FieldType): unknown {
  switch (type) {
    case 'boolean':
      return false
    case 'list':
      return []
    default:
      return ''
  }
}

// Coerce a row's editing value into the typed value stored in the object. Empty
// numbers are dropped; list items are trimmed and blanks removed.
function coerce(type: FieldType, value: unknown): unknown {
  switch (type) {
    case 'number': {
      if (value === '' || value === null || value === undefined) return undefined
      const n = Number(value)
      return Number.isNaN(n) ? undefined : n
    }
    case 'boolean':
      return Boolean(value)
    case 'list': {
      const arr = Array.isArray(value) ? value : String(value ?? '').split('\n')
      return arr.map((s) => String(s).trim()).filter(Boolean)
    }
    default:
      return String(value ?? '')
  }
}

// Build the plain object from rows, skipping unnamed keys and empty numbers.
function assemble(rows: Row[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    const value = coerce(row.type, row.value)
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

interface KeyValueBuilderProps {
  // Seed rows once on mount. Remount (via a changing key) to reset.
  initialValue?: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}

export function KeyValueBuilder({ initialValue, onChange }: KeyValueBuilderProps) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromValue(initialValue ?? {}))

  const commit = (next: Row[]) => {
    setRows(next)
    onChange(assemble(next))
  }

  const patchRow = (id: string, patch: Partial<Row>) =>
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const changeType = (id: string, type: FieldType) =>
    commit(rows.map((r) => (r.id === id ? { ...r, type, value: defaultValueFor(type) } : r)))

  const addRow = () => commit([...rows, emptyRow()])

  const removeRow = (id: string) => {
    const next = rows.filter((r) => r.id !== id)
    commit(next.length ? next : [emptyRow()])
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start gap-2">
          <Input
            aria-label="Field name"
            placeholder="Field name"
            className="w-1/3"
            value={row.key}
            onChange={(e) => patchRow(row.id, { key: e.target.value })}
          />
          <select
            aria-label="Field type"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={row.type}
            onChange={(e) => changeType(row.id, e.target.value as FieldType)}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex-1">
            {row.type === 'boolean' ? (
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label="Field value"
                  className="h-4 w-4"
                  checked={Boolean(row.value)}
                  onChange={(e) => patchRow(row.id, { value: e.target.checked })}
                />
                <span className="text-muted-foreground">{row.value ? 'Yes' : 'No'}</span>
              </label>
            ) : row.type === 'list' ? (
              <textarea
                aria-label="Field value"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder="One item per line"
                rows={2}
                value={
                  Array.isArray(row.value)
                    ? (row.value as string[]).join('\n')
                    : String(row.value ?? '')
                }
                onChange={(e) => patchRow(row.id, { value: e.target.value.split('\n') })}
              />
            ) : (
              <Input
                aria-label="Field value"
                type={row.type === 'number' ? 'number' : row.type === 'date' ? 'date' : 'text'}
                placeholder="Value"
                value={row.value === undefined || row.value === null ? '' : String(row.value)}
                onChange={(e) => patchRow(row.id, { value: e.target.value })}
              />
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove field"
            className="h-9 w-9 shrink-0"
            onClick={() => removeRow(row.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" />
        Add field
      </Button>
    </div>
  )
}
