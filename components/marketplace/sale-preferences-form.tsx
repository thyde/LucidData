'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/lib/hooks/use-toast'
import { setSalePreferencesAction } from '@/lib/actions/monetization.actions'
import type { SalePreferences } from '@/types/database.types'

export function SalePreferencesForm({ initial }: { initial: SalePreferences | null }) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [autoOptin, setAutoOptin] = useState(initial?.auto_optin ?? false)
  const [minPrice, setMinPrice] = useState(
    initial ? (initial.min_price_cents / 100).toString() : '0'
  )
  const [purposes, setPurposes] = useState((initial?.allowed_purposes ?? []).join(', '))

  function handleSave() {
    const minPriceCents = Math.max(0, Math.round(parseFloat(minPrice || '0') * 100))
    const allowedPurposes = purposes
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    startTransition(async () => {
      try {
        await setSalePreferencesAction({
          auto_optin: autoOptin,
          min_price_cents: minPriceCents,
          allowed_purposes: allowedPurposes,
          blocked_buyer_orgs: initial?.blocked_buyer_orgs ?? [],
        })
        toast({ title: 'Preferences saved' })
      } catch {
        toast({ title: 'Could not save preferences', variant: 'destructive' })
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="min-price">Minimum price per record (USD)</Label>
        <Input
          id="min-price"
          type="number"
          min="0"
          step="0.01"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          Pools paying less than this are flagged before you contribute.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="purposes">Allowed purposes</Label>
        <Input
          id="purposes"
          value={purposes}
          onChange={(e) => setPurposes(e.target.value)}
          placeholder="research, analytics, marketing"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated list of purposes you are comfortable selling for.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={autoOptin} onCheckedChange={(v) => setAutoOptin(v === true)} />
        Automatically suggest matching pools for new vault entries
      </label>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? 'Saving…' : 'Save preferences'}
      </Button>
    </div>
  )
}
