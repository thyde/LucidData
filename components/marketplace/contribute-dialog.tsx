'use client'

import { useMemo, useState, useTransition } from 'react'
import { Lock, ShieldCheck, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useVaultList } from '@/lib/hooks/useVault'
import { useEncryption } from '@/lib/context/encryption-context'
import { useToast } from '@/lib/hooks/use-toast'
import { toFieldEntries, buildAnonymizedPayload } from '@/lib/crypto/anonymize'
import { contributeAction } from '@/lib/actions/contribution.actions'
import { formatCents } from '@/components/dashboard/chart-theme'
import type { DataPool } from '@/types/database.types'
import type { DecryptedVaultData } from '@/types'

interface ContributeDialogProps {
  pool: DataPool
  open: boolean
  onOpenChange: (open: boolean) => void
  onContributed?: () => void
}

export function ContributeDialog({ pool, open, onOpenChange, onContributed }: ContributeDialogProps) {
  const { isLocked } = useEncryption()
  const { data: entries, isLoading } = useVaultList()
  const { toast } = useToast()
  const [selected, setSelected] = useState<DecryptedVaultData | null>(null)
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const fields = useMemo(() => (selected ? toFieldEntries(selected.data) : []), [selected])

  function selectEntry(entry: DecryptedVaultData) {
    setSelected(entry)
    const requested = new Set(pool.requested_fields)
    // Default-check non-identifier fields that the pool requested (or all if none specified).
    const initial = new Set<string>()
    for (const f of toFieldEntries(entry.data)) {
      if (f.isIdentifier) continue
      if (pool.requested_fields.length === 0 || requested.has(f.key)) initial.add(f.key)
    }
    setCheckedKeys(initial)
  }

  function toggleKey(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function reset() {
    setSelected(null)
    setCheckedKeys(new Set())
  }

  function handleSubmit() {
    if (!selected) return
    const payload = buildAnonymizedPayload(selected.data, Array.from(checkedKeys))
    if (Object.keys(payload).length === 0) {
      toast({ title: 'Select at least one field to share', variant: 'destructive' })
      return
    }
    startTransition(async () => {
      try {
        await contributeAction({
          pool_id: pool.id,
          vault_data_id: selected.id,
          category: pool.category,
          anonymized_payload: payload,
        })
        toast({
          title: 'Shared to pool',
          description: `You earn ${formatCents(pool.price_per_record_cents)} per purchase.`,
        })
        reset()
        onOpenChange(false)
        onContributed?.()
      } catch (err) {
        toast({
          title: 'Could not contribute',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contribute to {pool.name}</DialogTitle>
          <DialogDescription>
            Only the fields you check are shared. Identifiers are removed in your browser before
            anything leaves your device.
          </DialogDescription>
        </DialogHeader>

        {isLocked ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" /> Your vault is locked. Unlock it from the Vault page to
            contribute.
          </div>
        ) : !selected ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Choose a vault entry to share from</p>
            {isLoading && <p className="text-sm text-muted-foreground">Loading your vault…</p>}
            {!isLoading && (entries?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                Your vault is empty. Add an entry first.
              </p>
            )}
            <div className="space-y-2">
              {entries?.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => selectEntry(entry)}
                  disabled={!!entry.decryptionError}
                  className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-medium">{entry.label}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {entry.category}
                    </span>
                  </span>
                  <Badge variant="secondary">Select</Badge>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={reset}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to entries
            </button>
            <p className="text-sm font-medium">Fields in {selected.label}</p>
            <ul className="space-y-1">
              {fields.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  This entry has no structured fields to share.
                </li>
              )}
              {fields.map((field) => (
                <li
                  key={field.key}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={checkedKeys.has(field.key)}
                      onCheckedChange={() => toggleKey(field.key)}
                      disabled={field.isIdentifier}
                      aria-label={`Share ${field.key}`}
                    />
                    <span className="text-sm">{field.key}</span>
                  </span>
                  {field.isIdentifier ? (
                    <Badge variant="destructive">Identifier removed</Badge>
                  ) : (
                    <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                      {String(field.value)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 rounded-md bg-primary/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {checkedKeys.size} field(s) will be shared anonymously · earn{' '}
              {formatCents(pool.price_per_record_cents)} per purchase.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selected || isLocked || isPending}>
            {isPending ? 'Sharing…' : 'Share to pool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
