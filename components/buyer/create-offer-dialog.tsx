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
import { createOfferAction } from '@/lib/actions/offer.actions'

const CATEGORIES = ['personal', 'health', 'financial', 'credentials', 'location', 'interests', 'browsing', 'other']

export function CreateOfferDialog({ orgId }: { orgId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({ title: '', description: '', incentive: '', target_category: 'personal' })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await createOfferAction(orgId, {
          title: form.title,
          description: form.description || undefined,
          incentive: form.incentive,
          target_category: form.target_category,
        })
        toast({ title: 'Offer published' })
        setOpen(false)
        setForm({ title: '', description: '', incentive: '', target_category: 'personal' })
        router.refresh()
      } catch (err) {
        toast({
          title: 'Could not publish offer',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Create offer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create an offer</DialogTitle>
          <DialogDescription>
            Incentivize individuals to share a category of data with your organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="offer-title">Title</Label>
            <Input
              id="offer-title"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="20% off for sharing fitness data"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-incentive">Incentive</Label>
            <Input
              id="offer-incentive"
              required
              value={form.incentive}
              onChange={(e) => setForm((f) => ({ ...f, incentive: e.target.value }))}
              placeholder="20% off your next order"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-desc">Description</Label>
            <Textarea
              id="offer-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-category">Target category</Label>
            <select
              id="offer-category"
              value={form.target_category}
              onChange={(e) => setForm((f) => ({ ...f, target_category: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Publishing…' : 'Publish offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
