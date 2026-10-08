'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEncryption } from '@/lib/context/encryption-context'
import { useToast } from '@/lib/hooks/use-toast'
import { createVaultEntryAction } from '@/lib/actions/vault.actions'
import { unwrap } from '@/lib/actions/unwrap'
import { VAULT_KEYS } from '@/lib/hooks/useVault'
import {
  HEALTH_CONSENT_DECLINED_MESSAGE,
  useHealthConsent,
  withHealthConsent,
} from '@/lib/hooks/use-health-consent'
import {
  parseImportFile,
  labelForRecord,
  autoGuessMapping,
  applyFieldMapping,
  type ParsedImport,
  type FieldMapping,
} from '@luciddata/core/vault/import-parsers'
import { parseWithAdapter } from '@luciddata/core/vault/adapters'
import { ENTERABLE_SCHEMA_TYPES, VAULT_SCHEMA_TYPES } from '@luciddata/core/schemas/vault-schemas'
import { SCHEMA_FORM_FIELDS } from '@luciddata/core/schemas/form-fields'
import { fitLabel, importedEntryLabel } from '@luciddata/core/vault/labels'
import { vaultTagsSchema } from '@luciddata/core/validations/vault'
import { summarizeSchemaErrors, validateSchemaData } from '@luciddata/core/schemas/validate'
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

/**
 * LD-205: the extension banner hands a detected export in through this event
 * rather than through a prop, so the dialog keeps its own state and its
 * public shape does not change.
 */
export const IMPORT_FILE_EVENT = 'lucid:import-file'

// Import a .json or .csv file into vault entries. Parsing and encryption both happen
// in the browser, so the file's plaintext never reaches the server: each record is
// encrypted locally and saved as its own entry.
export function VaultImportDialog() {
  const [open, setOpen] = useState(false)
  const { encrypt, isLocked } = useEncryption()
  const { requestHealthConsent } = useHealthConsent()
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
  /** LD-203: which provider adapter read the file, if any. */
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null)
  /** Records the file held when the adapter stopped short of all of them. */
  const [truncatedFrom, setTruncatedFrom] = useState<number | null>(null)

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
    setAdapterLabel(null)
    setTruncatedFrom(null)
  }

  /**
   * Select a schema type and derive the column mapping and category from it.
   *
   * Takes the records rather than reading `parsed`, because an adapter sets the
   * type in the same tick it sets the records and state has not settled yet.
   */
  const applyTargetType = (type: string, records: Record<string, unknown>[]) => {
    setTargetType(type)
    if (type !== 'custom' && SCHEMA_FORM_FIELDS[type]) {
      const keys = new Set<string>()
      for (const rec of records.slice(0, 50)) Object.keys(rec).forEach((k) => keys.add(k))
      setMapping(autoGuessMapping(SCHEMA_FORM_FIELDS[type], Array.from(keys)))
      setCategory(VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES].category)
    } else {
      setMapping({})
    }
  }

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setParseError(null)
    setParsed(null)
    setTargetType('custom')
    setMapping({})
    setAdapterLabel(null)
    setTruncatedFrom(null)
    setFileName(file.name)
    const base = file.name.replace(/\.[^.]+$/, '')
    setLabelPrefix(base || 'Imported')
    try {
      const text = await file.text()

      // LD-203: a provider adapter goes first, because it knows the file's own
      // shape. Anything it does not recognise falls through to the generic
      // parser, so this stays additive.
      const adapted = parseWithAdapter(file.name, text, { limit: MAX_RECORDS })
      if (adapted) {
        if (adapted.records.length === 0) {
          setParseError(`This looks like a ${adapted.adapterLabel} export, but it holds no records we could read.`)
          return
        }
        setAdapterLabel(adapted.adapterLabel)
        setTruncatedFrom(adapted.truncated ? adapted.totalFound : null)
        setParsed({ records: adapted.records, format: 'json' })
        if (adapted.schemaType) {
          applyTargetType(adapted.schemaType, adapted.records)
        }
        return
      }

      const result = parseImportFile(file.name, text)
      if (result.records.length === 0) {
        setParseError('No records found in this file.')
        return
      }
      setParsed(result)
    } catch {
      setParseError('Could not read this file. Use a .json or .csv file.')
    }
  }, [])

  // Choosing a schema type auto-guesses a column mapping and aligns the category.
  const handleTargetTypeChange = (type: string) => {
    applyTargetType(type, parsed?.records ?? [])
  }

  const tags = useMemo(
    () =>
      tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput]
  )
  const tagsCheck = vaultTagsSchema.safeParse(tags)
  const tagsError = tagsCheck.success ? null : tagsCheck.error.issues[0].message

  const handleImport = async () => {
    if (!parsed || isLocked || tagsError) return
    const records = parsed.records.slice(0, MAX_RECORDS)
    const fields = targetType !== 'custom' ? SCHEMA_FORM_FIELDS[targetType] : null
    const fieldLabels = Object.fromEntries((fields ?? []).map((field) => [field.name, field.label]))

    setImporting(true)
    setProgress({ done: 0, total: records.length })

    let failed = 0
    let skipped = 0
    let firstProblem: string | null = null
    let stopped = false
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const data = fields ? applyFieldMapping(record, fields, mapping) : record
      if (fields) {
        // Checked before encryption, because the server cannot read the row to
        // check it. A row that does not fit is skipped rather than saved.
        const checked = validateSchemaData(targetType, data)
        if (!checked.success) {
          skipped++
          firstProblem ??= summarizeSchemaErrors(checked, fieldLabels)
          setProgress({ done: i + 1, total: records.length })
          continue
        }
      }
      try {
        const encrypted = await encrypt(JSON.stringify(data))
        // unwrap turns a refused write into a throw, so it counts as a failure
        // instead of being reported as imported. LD-110: a health import asks
        // for consent on the first record and the rest follow.
        await withHealthConsent(
          () =>
            unwrap(
              createVaultEntryAction({
                // Labels are readable. A provider export's records carry free
                // text, such as a workout's name, so those are labelled by type.
                label: adapterLabel
                  ? importedEntryLabel(fields ? targetType : 'custom')
                  : labelForRecord(record, fitLabel(`${labelPrefix || 'Imported'} ${i + 1}`)),
                category,
                tags,
                schema_type: fields ? targetType : undefined,
                ...encrypted,
              })
            ),
          requestHealthConsent
        )
      } catch (error) {
        if (error instanceof Error && error.message === HEALTH_CONSENT_DECLINED_MESSAGE) {
          stopped = true
          break
        }
        failed++
      }
      setProgress({ done: i + 1, total: records.length })
    }

    await queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() })
    if (stopped) {
      toast({
        title: 'Import stopped',
        description: HEALTH_CONSENT_DECLINED_MESSAGE,
      })
      setImporting(false)
      setProgress(null)
      return
    }
    const imported = records.length - failed - skipped
    const notes: string[] = []
    if (skipped > 0) {
      const typeLabel = VAULT_SCHEMA_TYPES[targetType as keyof typeof VAULT_SCHEMA_TYPES].label
      notes.push(`Skipped ${skipped} that did not fit the ${typeLabel} fields. ${firstProblem}.`)
    }
    if (failed > 0) notes.push(`${failed} failed.`)
    toast({
      title: imported > 0 ? 'Import complete' : 'Nothing imported',
      description:
        notes.length > 0
          ? [`Imported ${imported} of ${records.length} entries.`, ...notes].join(' ')
          : `Imported ${imported} ${imported === 1 ? 'entry' : 'entries'}.`,
    })
    if (imported === 0 && skipped > 0) {
      // Keep the file and the mapping, since a wrong column is the usual cause.
      setImporting(false)
      setProgress(null)
      return
    }
    reset()
    setOpen(false)
  }

  const firstRecord = parsed?.records[0]
  const sampleKeys = firstRecord ? Object.keys(firstRecord).slice(0, 8) : []

  // LD-205: accept a file the extension banner detected.
  useEffect(() => {
    function onImportFile(event: Event) {
      const file = (event as CustomEvent<File>).detail
      if (!file) return
      setOpen(true)
      void handleFile(file)
    }
    window.addEventListener(IMPORT_FILE_EVENT, onImportFile)
    return () => window.removeEventListener(IMPORT_FILE_EVENT, onImportFile)
  }, [handleFile])

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
              accept=".json,.csv,.xml,.tsv,application/json,text/csv,text/xml"
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
                {adapterLabel && (
                  <p className="mt-1 text-muted-foreground">
                    Read as a {adapterLabel} export, so the fields have been named consistently for
                    you. Change anything below that looks wrong.
                  </p>
                )}
                {sampleKeys.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Fields: {sampleKeys.join(', ')}
                    {firstRecord && Object.keys(firstRecord).length > sampleKeys.length ? '…' : ''}
                  </p>
                )}
                {truncatedFrom !== null && (
                  <p className="mt-1 text-muted-foreground">
                    The file holds {truncatedFrom.toLocaleString()} records. The first{' '}
                    {MAX_RECORDS} were read.
                  </p>
                )}
                {truncatedFrom === null && parsed.records.length > MAX_RECORDS && (
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
                  {ENTERABLE_SCHEMA_TYPES.map((key) => (
                    <option key={key} value={key}>
                      {key === 'custom' ? 'Keep fields as-is' : VAULT_SCHEMA_TYPES[key].label}
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

              {adapterLabel ? (
                <p className="text-xs text-muted-foreground">
                  Each entry is labelled with its type, such as Workout. Labels are not encrypted,
                  so names and dates from the export stay in the encrypted data.
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="import-label-prefix">Label prefix</Label>
                  <Input
                    id="import-label-prefix"
                    value={labelPrefix}
                    maxLength={80}
                    onChange={(e) => setLabelPrefix(e.target.value)}
                    placeholder="Imported"
                  />
                  <p className="text-xs text-muted-foreground">
                    A record&apos;s name, title, or label field becomes its label, and this is used when
                    it has none. Labels are not encrypted, so LucidData can see them.
                  </p>
                </div>
              )}

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
                  aria-invalid={tagsError ? true : undefined}
                  aria-describedby={tagsError ? 'import-tags-error' : undefined}
                />
                {tagsError && (
                  <p id="import-tags-error" className="text-sm text-destructive">
                    {tagsError}
                  </p>
                )}
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
          <Button
            type="button"
            onClick={handleImport}
            disabled={!parsed || importing || isLocked || Boolean(tagsError)}
          >
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
