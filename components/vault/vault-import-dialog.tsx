'use client'

import { useState, useMemo } from 'react'
import { Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEncryption } from '@/lib/context/encryption-context'
import { useToast } from '@/lib/hooks/use-toast'
import { createVaultEntryAction } from '@/lib/actions/vault.actions'
import { VAULT_KEYS } from '@/lib/hooks/useVault'
import {
  parseImportFile,
  labelForRecord,
  autoGuessMapping,
  applyFieldMapping,
  type ParsedImport,
  type FieldMapping,
} from '@/lib/vault/import-parsers'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CATEGORY_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'health', label: 'Health' },
  { value: 'financial', label: 'Financial' },
  { value: 'credentials', label: 'Credentials' },
  { value: 'other', label: 'Other' },
]

const MAX_RECORDS = 1000

// Import a .json or .csv file into vault entries. Parsing and encryption both happen
// in the browser, so the file's plaintext never reaches the server: each record is
// encrypted locally and saved as its own entry.
export function VaultImportDialog() {
  const [open, setOpen] = useState(false)
  const { encrypt, isLocked } = useEncryption()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [labelPrefix, setLabelPrefix] = useState('Imported')
  const [category, setCategory] = useState('personal')
  const [tagsInput, setTagsInput] = useState('')
  const [targetType, setTargetType] = useState<string>('custom')
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const sourceKeys = useMemo(() => {
    if (!parsed) return [] as string[]
    const keys = new Set<string>()
    for (const rec of parsed.records.slice(0, 50)) {
      Object.keys(rec).forEach((k) => keys.add(k))
    }
    return Array.from(keys)
  }, [parsed])

  const reset = () => {
    setFileName('')
    setParsed(null)
    setParseError(null)
    setLabelPrefix('Imported')
    setCategory('personal')
    setTagsInput('')
    setTargetType('custom')
    setMapping({})
    setImporting(false)
    setProgress(null)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setParseError(null)
    setParsed(null)
    setTargetType('custom')
    setMapping({})
    setFileName(file.name)
    const base = file.name.replace(/\.[^.]+$/, '')
    setLabelPrefix(base || 'Imported')
    try {
      const text = await file.text()
      const result = parseImportFile(file.name, text)
      if (result.records.length === 0) {
        setParseError('No records found in this file.')
        return
      }
      setParsed(result)
    } catch {
      setParseError('Could not read this file. Use a .json or .csv file.')
    }
  }

  // Choosing a schema type auto-guesses a column mapping and aligns the category.
  const handleTargetTypeChange = (type: string) => {
    setTargetType(type)
    if (type !== 'custom' && SCHEMA_FORM_FIELDS[type]) {
      setMapping(autoGuessMapping(SCHEMA_FORM_FIELDS[type], sourceKeys))
      setCategory(VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES].category)
    } else {
      setMapping({})
    }
  }

  const handleImport = async () => {
    if (!parsed || isLocked) return
    const records = parsed.records.slice(0, MAX_RECORDS)
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const fields = targetType !== 'custom' ? SCHEMA_FORM_FIELDS[targetType] : null

    setImporting(true)
    setProgress({ done: 0, total: records.length })

    let failed = 0
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const data = fields ? applyFieldMapping(record, fields, mapping) : record
      try {
        const encrypted = await encrypt(JSON.stringify(data))
        await createVaultEntryAction({
          label: labelForRecord(record, `${labelPrefix} ${i + 1}`),
          category,
          tags,
          schema_type: fields ? targetType : undefined,
          ...encrypted,
        })
      } catch {
        failed++
      }
      setProgress({ done: i + 1, total: records.length })
    }

    await queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() })
    const imported = records.length - failed
    toast({
      title: 'Import complete',
      description:
        failed > 0
          ? `Imported ${imported} of ${records.length} entries. ${failed} failed.`
          : `Imported ${imported} ${imported === 1 ? 'entry' : 'entries'}.`,
    })
    reset()
    setOpen(false)
  }

  const firstRecord = parsed?.records[0]
  const sampleKeys = firstRecord ? Object.keys(firstRecord).slice(0, 8) : []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          Import file
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from a file</DialogTitle>
          <DialogDescription>
            Import a .json or .csv file. Records are parsed and encrypted in your browser, then saved
            as vault entries. The file never leaves your device unencrypted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-file">File</Label>
            <Input
              id="import-file"
              type="file"
              accept=".json,.csv,application/json,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {fileName && !parseError && (
              <p className="text-xs text-muted-foreground">{fileName}</p>
            )}
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          </div>

          {parsed && (
            <>
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  {parsed.records.length} {parsed.records.length === 1 ? 'entry' : 'entries'} found (
                  {parsed.format.toUpperCase()})
                </p>
                {sampleKeys.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Fields: {sampleKeys.join(', ')}
                    {firstRecord && Object.keys(firstRecord).length > sampleKeys.length ? '…' : ''}
                  </p>
                )}
                {parsed.records.length > MAX_RECORDS && (
                  <p className="mt-1 text-muted-foreground">
                    Only the first {MAX_RECORDS} will be imported.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-target-type">Save as</Label>
                <select
                  id="import-target-type"
                  title="Save as"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={targetType}
                  onChange={(e) => handleTargetTypeChange(e.target.value)}
                >
                  {Object.entries(VAULT_SCHEMA_TYPES).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {key === 'custom' ? 'Keep fields as-is' : label}
                    </option>
                  ))}
                </select>
                {targetType !== 'custom' && (
                  <p className="text-xs text-muted-foreground">
                    Map your columns to{' '}
                    {VAULT_SCHEMA_TYPES[targetType as keyof typeof VAULT_SCHEMA_TYPES].label} fields.
                  </p>
                )}
              </div>

              {targetType !== 'custom' && SCHEMA_FORM_FIELDS[targetType] && (
                <div className="space-y-1.5 rounded-md border p-3">
                  {SCHEMA_FORM_FIELDS[targetType].map((field) => (
                    <div key={field.name} className="flex items-center gap-2">
                      <span className="w-1/2 text-sm">
                        {field.label}
                        {field.required && <span className="ml-1 text-destructive">*</span>}
                      </span>
                      <select
                        aria-label={`Map ${field.label}`}
                        className="flex h-9 w-1/2 rounded-md border border-input bg-background px-2 text-sm"
                        value={mapping[field.name] ?? ''}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [field.name]: e.target.value }))
                        }
                      >
                        <option value="">(skip)</option>
                        {sourceKeys.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="import-label-prefix">Label prefix</Label>
                <Input
                  id="import-label-prefix"
                  value={labelPrefix}
                  onChange={(e) => setLabelPrefix(e.target.value)}
                  placeholder="Imported"
                />
                <p className="text-xs text-muted-foreground">
                  Used when a record has no name, title, or label field.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-category">Category</Label>
                <select
                  id="import-category"
                  title="Category"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-tags">Tags</Label>
                <Input
                  id="import-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Comma-separated, applied to all"
                />
              </div>

              {progress && (
                <p className="text-sm text-muted-foreground">
                  Encrypting and saving {progress.done} of {progress.total}…
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false)
              reset()
            }}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={!parsed || importing || isLocked}>
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
