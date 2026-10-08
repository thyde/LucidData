'use client'

import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEncryption } from '@/lib/context/encryption-context'
import { useToast } from '@/lib/hooks/use-toast'
import { HEALTH_CONSENT_DECLINED_MESSAGE, useHealthConsent } from '@/lib/hooks/use-health-consent'
import { createVaultEntriesAction, getStoredSourceRecordIdsAction } from '@/lib/actions/vault.actions'
import { unwrap } from '@/lib/actions/unwrap'
import { VAULT_KEYS } from '@/lib/hooks/useVault'
import { VAULT_SCHEMA_TYPES, type VaultSchemaType } from '@luciddata/core/schemas/vault-schemas'
import {
  runImport,
  type ExportReadResult,
  type ImportOutcome,
  type ImportProgress,
} from '@luciddata/core/vault/archive'
import { Button } from '@/components/ui/button'

interface HealthExportImportProps {
  result: ExportReadResult
  /** Called once the import has finished and the dialog can close. */
  onDone: () => void
  /** Told when an import starts and stops, so the dialog stays open meanwhile. */
  onBusyChange?: (busy: boolean) => void
}

const SKIP_REASONS: Record<string, string> = {
  unknown_unit: 'in a unit LucidData does not read',
  implausible: 'outside what a body produces',
  unreadable: 'with a date or value that could not be read',
  incomplete: 'with nothing left to save',
}

const number = (value: number) => value.toLocaleString()
const entries = (count: number) => `${number(count)} ${count === 1 ? 'entry' : 'entries'}`

function dayOf(iso: string | undefined): string | null {
  if (!iso) return null
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

/**
 * LD-210: import a health export that was read in the browser.
 *
 * Each record is encrypted here with its own key and saved a batch at a time.
 * Records the vault already holds are skipped before they are encrypted, so
 * running the same export again adds only what is new, and an import that was
 * stopped carries on where it left off.
 */
export function HealthExportImport({ result, onDone, onBusyChange }: HealthExportImportProps) {
  const { encrypt, isLocked } = useEncryption()
  const { requestHealthConsent } = useHealthConsent()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const counts = useMemo(() => {
    const byType = new Map<VaultSchemaType, number>()
    for (const record of result.records) byType.set(record.schemaType, (byType.get(record.schemaType) ?? 0) + 1)
    return [...byType.entries()]
  }, [result])
  const [chosen, setChosen] = useState<Set<VaultSchemaType>>(() => new Set(counts.map(([type]) => type)))
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [importing, setImporting] = useState(false)
  const stop = useRef<AbortController | null>(null)

  const selected = useMemo(() => result.records.filter((record) => chosen.has(record.schemaType)), [result, chosen])
  const first = dayOf(result.records[0]?.capturedAt)
  const last = dayOf(result.records[result.records.length - 1]?.capturedAt)
  const skipped = Object.entries(result.skipped).filter(([, count]) => count > 0)

  function toggle(type: VaultSchemaType) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function report(outcome: ImportOutcome) {
    if (outcome.stopped === 'consent_declined') {
      toast({ title: 'Import stopped', description: HEALTH_CONSENT_DECLINED_MESSAGE })
      return
    }
    if (outcome.stopped === 'recovery_required') {
      toast({ variant: 'destructive', title: 'Nothing was saved', description: outcome.firstError ?? undefined })
      return
    }

    const parts: string[] = []
    if (outcome.stored > 0) parts.push(`Saved ${entries(outcome.stored)}.`)
    if (outcome.alreadyStored > 0) {
      parts.push(
        outcome.stored === 0 && outcome.failed === 0
          ? 'Everything in this export was already in your vault.'
          : `${number(outcome.alreadyStored)} were already in your vault.`
      )
    }
    if (outcome.failed > 0) {
      const reason = (outcome.firstError ?? 'Try again').replace(/\.$/, '')
      parts.push(`${entries(outcome.failed)} could not be saved: ${reason}.`)
    }

    if (outcome.stopped === 'cancelled') {
      parts.push('Import the same file again to carry on.')
      toast({ title: 'Import stopped', description: parts.join(' ') })
    } else if (outcome.failed > 0) {
      toast({ variant: 'destructive', title: 'Some entries were not saved', description: parts.join(' ') })
    } else {
      toast({ title: 'Import complete', description: parts.join(' ') })
    }
  }

  async function start() {
    if (isLocked || selected.length === 0) return
    const controller = new AbortController()
    stop.current = controller
    setImporting(true)
    onBusyChange?.(true)
    try {
      const outcome = await runImport(selected, result.provider, {
        encrypt,
        store: (entries) => unwrap(createVaultEntriesAction(entries)),
        alreadyStored: () => unwrap(getStoredSourceRecordIdsAction(result.provider)),
        askForHealthConsent: requestHealthConsent,
        onProgress: setProgress,
        signal: controller.signal,
      })
      await queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() })
      report(outcome)
      if (outcome.stopped !== 'recovery_required') onDone()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Import stopped',
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setImporting(false)
      onBusyChange?.(false)
      stop.current = null
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">{result.label} export</p>
        {first && last && (
          <p className="mt-1 text-muted-foreground">
            {first === last ? `From ${first}.` : `From ${first} to ${last}.`}
          </p>
        )}
        {skipped.length > 0 && (
          <p className="mt-1 text-muted-foreground">
            Left out:{' '}
            {skipped
              .map(([reason, count]) => `${number(count)} ${count === 1 ? 'reading' : 'readings'} ${SKIP_REASONS[reason] ?? reason}`)
              .join('; ')}
            .
          </p>
        )}
      </div>

      <fieldset className="space-y-2" disabled={importing}>
        <legend className="text-sm font-medium">What to import</legend>
        {counts.map(([type, count]) => (
          <label key={type} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={chosen.has(type)}
              onChange={() => toggle(type)}
            />
            {VAULT_SCHEMA_TYPES[type].label} ({number(count)})
          </label>
        ))}
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Each entry is encrypted in your browser before it is saved, and labelled with its type, such
        as Workout, because labels are not encrypted. Importing the same export again adds only what
        is new.
      </p>

      {isLocked && !importing && (
        <p className="text-sm text-destructive">Unlock your vault to import.</p>
      )}

      {progress && (
        <p className="text-sm text-muted-foreground" role="status">
          Saving {number(progress.done)} of {number(progress.total)}.
          {progress.alreadyStored > 0 && ` ${number(progress.alreadyStored)} were already in your vault.`}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {importing ? (
          <Button type="button" variant="outline" onClick={() => stop.current?.abort()}>
            Stop
          </Button>
        ) : null}
        <Button type="button" onClick={start} disabled={importing || isLocked || selected.length === 0}>
          {importing ? 'Importing…' : `Import ${entries(selected.length)}`}
        </Button>
      </div>
    </div>
  )
}
