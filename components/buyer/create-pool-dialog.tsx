'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/lib/hooks/use-toast'
import { createPoolAction } from '@/lib/actions/marketplace.actions'
import { formatCents } from '@/components/dashboard/chart-theme'
import {
  DATA_TYPE_PRICING,
  SENSITIVITY_LABEL,
  suggestedPerRecordCents,
  suggestedAccessFeeCents,
} from '@/lib/constants/data-pricing'
import type { DataCategory } from '@/lib/validations/marketplace'
import {
  MARKETPLACE_PURPOSE_LABELS,
  type MarketplacePurpose,
} from '@/lib/validations/marketplace'

const CATEGORIES = ['personal', 'credentials', 'interests', 'other'] as const

function dollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

function makeDefaults() {
  return {
    name: '',
    description: '',
    category: 'personal',
    purpose: 'research' as MarketplacePurpose,
    minimum_contributors: '5',
    retention_days: '30',
    requested_fields: '',
    pricing_model: 'snapshot',
    price: dollars(suggestedAccessFeeCents('personal')),
    price_per_record: dollars(suggestedPerRecordCents('personal')),
  }
}

export function CreatePoolDialog({ orgId, disabled = false }: { orgId: string; disabled?: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState(makeDefaults)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await createPoolAction(orgId, {
          name: form.name,
          description: form.description || undefined,
          category: form.category,
          purpose: form.purpose,
          minimum_contributors: Number(form.minimum_contributors),
          retention_days: Number(form.retention_days),
          requested_fields: form.requested_fields
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean),
          pricing_model: form.pricing_model,
          price_cents: Math.round(parseFloat(form.price || '0') * 100),
          price_per_record_cents: Math.round(parseFloat(form.price_per_record || '0') * 100),
        })
        toast({ title: 'Data pool created' })
        setOpen(false)
        setForm(makeDefaults())
        router.refresh()
      } catch (err) {
        toast({
          title: 'Could not create pool',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function handleCategoryChange(value: string) {
    const cat = value as DataCategory
    setForm((f) => ({
      ...f,
      category: value,
      price: dollars(suggestedAccessFeeCents(cat)),
      price_per_record: dollars(suggestedPerRecordCents(cat)),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Create data pool</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a data pool</DialogTitle>
          <DialogDescription>
            Describe the dataset you want. Individuals contribute the fields they choose.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pool-name">Name</Label>
            <Input
              id="pool-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Anonymized fitness data"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pool-desc">Description</Label>
            <Textarea
              id="pool-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this dataset is for"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pool-category">Category</Label>
              <select
                id="pool-category"
                aria-label="Category"
                value={form.category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pool-purpose">Purpose</Label>
              <select
                id="pool-purpose"
                aria-label="Purpose"
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value as MarketplacePurpose }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(MARKETPLACE_PURPOSE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pool-minimum">Minimum contributors</Label>
              <Input
                id="pool-minimum"
                type="number"
                min="5"
                max="100000"
                value={form.minimum_contributors}
                onChange={(e) => setForm((f) => ({ ...f, minimum_contributors: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pool-retention">Declared retention (days)</Label>
              <Input
                id="pool-retention"
                type="number"
                min="1"
                max="365"
                value={form.retention_days}
                onChange={(e) => setForm((f) => ({ ...f, retention_days: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pool-fields">Requested fields (comma-separated)</Label>
            <Input
              id="pool-fields"
              value={form.requested_fields}
              onChange={(e) => setForm((f) => ({ ...f, requested_fields: e.target.value }))}
              placeholder="steps, heart_rate, sleep_hours"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pool-base">Base price (USD)</Label>
              <Input
                id="pool-base"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pool-per">Price per record (USD)</Label>
              <Input
                id="pool-per"
                type="number"
                min="0"
                step="0.01"
                value={form.price_per_record}
                onChange={(e) => setForm((f) => ({ ...f, price_per_record: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Suggested for {DATA_TYPE_PRICING[form.category as DataCategory].label.toLowerCase()} data:{' '}
            {formatCents(suggestedPerRecordCents(form.category as DataCategory))} per record plus a{' '}
            {formatCents(suggestedAccessFeeCents(form.category as DataCategory))} access fee.{' '}
            {SENSITIVITY_LABEL[DATA_TYPE_PRICING[form.category as DataCategory].sensitivity]}.
          </p>
          <p className="text-xs text-muted-foreground">
            Health, financial, location, and browsing data are not available for sale until
            regulated-data safeguards and buyer verification are in place.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create pool'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
