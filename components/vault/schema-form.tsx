'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FormField } from '@luciddata/core/schemas/form-fields'

interface SchemaFormProps {
  fields: FormField[]
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  /** A message per field name, shown under the field and linked to it for screen readers. */
  errors?: Record<string, string>
}

export function SchemaForm({ fields, value, onChange, errors = {} }: SchemaFormProps) {
  const update = (name: string, val: unknown) => onChange({ ...value, [name]: val })
  const describedBy = (name: string) =>
    errors[name] ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` } : {}

  return (
    <div className="space-y-4">
      {fields.map(field => (
        <div key={field.name} className="space-y-1.5">
          <Label htmlFor={field.name}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>

          {field.type === 'text' && (
            <Input
              id={field.name}
              {...describedBy(field.name)}
              value={(value[field.name] as string) ?? ''}
              onChange={e => update(field.name, e.target.value)}
              placeholder={field.placeholder}
            />
          )}

          {field.type === 'date' && (
            <Input
              id={field.name}
              {...describedBy(field.name)}
              type="date"
              value={(value[field.name] as string) ?? ''}
              onChange={e => update(field.name, e.target.value || undefined)}
            />
          )}

          {field.type === 'datetime' && (
            <Input
              id={field.name}
              {...describedBy(field.name)}
              type="datetime-local"
              value={(value[field.name] as string) ?? ''}
              onChange={e => update(field.name, e.target.value || undefined)}
            />
          )}

          {field.type === 'number' && (
            <Input
              id={field.name}
              {...describedBy(field.name)}
              type="number"
              step="any"
              value={(value[field.name] as number) ?? ''}
              onChange={e => update(field.name, e.target.value ? Number(e.target.value) : undefined)}
              placeholder={field.placeholder}
            />
          )}

          {field.type === 'select' && field.options && (
            <select
              id={field.name}
              {...describedBy(field.name)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={(value[field.name] as string) ?? ''}
              onChange={e => update(field.name, e.target.value || undefined)}
            >
              <option value="">Select...</option>
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {field.type === 'multi-text' && (
            <textarea
              id={field.name}
              {...describedBy(field.name)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              value={((value[field.name] as string[]) ?? []).join('\n')}
              onChange={e => update(field.name, e.target.value.split('\n').filter(Boolean))}
              placeholder="One item per line"
              rows={3}
            />
          )}

          {field.type === 'checkbox' && (
            <div className="flex items-center gap-2">
              <input
                id={field.name}
                {...describedBy(field.name)}
                type="checkbox"
                className="h-4 w-4"
                checked={(value[field.name] as boolean) ?? false}
                onChange={e => update(field.name, e.target.checked)}
              />
              <span className="text-sm text-muted-foreground">{field.label}</span>
            </div>
          )}

          {errors[field.name] && (
            <p id={`${field.name}-error`} className="text-sm text-destructive">
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
