'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/lib/hooks/use-toast'
import { setSalePreferencesAction } from '@/lib/actions/monetization.actions'
import type { SalePreferences } from '@/types/database.types'
import {
  MARKETPLACE_PURPOSE_LABELS,
  type MarketplacePurpose,
} from '@/lib/validations/marketplace'

export function SalePreferencesForm({ initial }: { initial: SalePreferences | null }) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [minPrice, setMinPrice] = useState(
    initial ? (initial.min_price_cents / 100).toString() : '0'
  )
  const [purposes, setPurposes] = useState<Set<MarketplacePurpose>>(
    new Set(
      (initial?.allowed_purposes ?? []).filter(
        (purpose): purpose is MarketplacePurpose => purpose in MARKETPLACE_PURPOSE_LABELS
      )
    )
  )

  function togglePurpose(purpose: MarketplacePurpose) {
    setPurposes((current) => {
      const next = new Set(current)
      if (next.has(purpose)) next.delete(purpose)
      else next.add(purpose)
      return next
    })
  }

  function handleSave() {
    const minPriceCents = Math.max(0, Math.round(parseFloat(minPrice || '0') * 100))
    startTransition(async () => {
      try {
        await setSalePreferencesAction({
          auto_optin: initial?.auto_optin ?? false,
          min_price_cents: minPriceCents,
          allowed_purposes: Array.from(purposes),
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
        <Label>Allowed purposes</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(MARKETPLACE_PURPOSE_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={purposes.has(value as MarketplacePurpose)}
                onCheckedChange={() => togglePurpose(value as MarketplacePurpose)}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Leave all unchecked to review every purpose individually.
        </p>
      </div>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? 'Saving…' : 'Save preferences'}
      </Button>
    </div>
  )
}
