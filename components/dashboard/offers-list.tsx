'use client'

import { useState, useTransition } from 'react'
import { Gift, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { claimOfferAction } from '@/lib/actions/offer.actions'
import { categoryLabel } from '@/components/dashboard/chart-theme'
import type { Offer } from '@/types/database.types'

interface OffersListProps {
  offers: Offer[]
  claimedOfferIds: string[]
}

export function OffersList({ offers, claimedOfferIds }: OffersListProps) {
  const { toast } = useToast()
  const [claimed, setClaimed] = useState<Set<string>>(new Set(claimedOfferIds))
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (offers.length === 0) {
    return <p className="text-sm text-muted-foreground">No offers right now. Check back soon.</p>
  }

  function handleClaim(offerId: string) {
    setPendingId(offerId)
    startTransition(async () => {
      try {
        await claimOfferAction(offerId)
        setClaimed((prev) => new Set(prev).add(offerId))
        toast({ title: 'Offer claimed', description: 'We saved this offer to your account.' })
      } catch {
        toast({ title: 'Could not claim offer', variant: 'destructive' })
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <ul className="space-y-3">
      {offers.map((offer) => {
        const isClaimed = claimed.has(offer.id)
        return (
          <li key={offer.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{offer.title}</p>
                <p className="text-xs text-muted-foreground">
                  {offer.incentive} · {categoryLabel(offer.target_category)}
                </p>
              </div>
            </div>
            {isClaimed ? (
              <span className="flex items-center gap-1 text-xs font-medium text-primary">
                <Check className="h-4 w-4" /> Claimed
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleClaim(offer.id)}
                disabled={isPending && pendingId === offer.id}
              >
                {isPending && pendingId === offer.id ? 'Claiming…' : 'Claim'}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
