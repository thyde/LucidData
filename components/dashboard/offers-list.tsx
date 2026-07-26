'use client'

import { useState, useTransition } from 'react'
import { Gift, Check, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/lib/hooks/use-toast'
import { claimOfferAction, withdrawOfferClaimAction } from '@/lib/actions/offer.actions'
import { categoryLabel } from '@/components/dashboard/chart-theme'
import type { Offer, OfferClaim } from '@/types/database.types'

interface OffersListProps {
  offers: Offer[]
  claims: OfferClaim[]
}

interface OfferRow {
  key: string
  offerId: string
  title: string
  incentive: string
  category: string
  claim: OfferClaim | null
  stillOffered: boolean
}

export function OffersList({ offers, claims: initialClaims }: OffersListProps) {
  const { toast } = useToast()
  const [claims, setClaims] = useState(initialClaims)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const trackedClaims = claims.filter(
    (claim) => claim.status === 'claimed' || claim.status === 'redeemed'
  )
  const rows: OfferRow[] = [
    ...offers.map((offer) => ({
      key: offer.id,
      offerId: offer.id,
      title: offer.title,
      incentive: offer.incentive,
      category: offer.target_category,
      claim: trackedClaims.find((claim) => claim.offer_id === offer.id) ?? null,
      stillOffered: true,
    })),
    // Offers the buyer has since closed. The claim keeps its own copy of the
    // terms, so an incentive the user already accepted never disappears.
    ...trackedClaims
      .filter((claim) => !offers.some((offer) => offer.id === claim.offer_id))
      .map((claim) => ({
        key: claim.id,
        offerId: claim.offer_id,
        title: claim.offer_title,
        incentive: claim.incentive,
        category: claim.target_category,
        claim,
        stillOffered: false,
      })),
  ]

  function handleClaim(offerId: string) {
    setPendingId(offerId)
    startTransition(async () => {
      try {
        const claim = await claimOfferAction(offerId)
        setClaims((current) => [claim, ...current.filter((item) => item.id !== claim.id)])
        toast({
          title: 'Offer claimed',
          description: 'Use your redemption code with the buyer to get the incentive.',
        })
      } catch (error) {
        toast({
          title: 'Could not claim offer',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingId(null)
      }
    })
  }

  function handleRemove(claimId: string) {
    setPendingId(claimId)
    startTransition(async () => {
      try {
        const claim = await withdrawOfferClaimAction(claimId)
        setClaims((current) => current.map((item) => (item.id === claim.id ? claim : item)))
        toast({ title: 'Claimed offer removed' })
      } catch (error) {
        toast({
          title: 'Could not remove offer',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingId(null)
      }
    })
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    toast({ title: 'Redemption code copied' })
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No offers right now. Check back soon.</p>
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {row.incentive} · {categoryLabel(row.category)}
                </p>
                {!row.stillOffered && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    The buyer closed this offer. The incentive you claimed still stands.
                  </p>
                )}
                {row.claim?.status === 'redeemed' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    You redeemed this incentive with the buyer.
                  </p>
                )}
              </div>
            </div>
            {row.claim?.status === 'redeemed' ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                <Check className="h-4 w-4" /> Redeemed
              </span>
            ) : row.claim ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                <Check className="h-4 w-4" /> Claimed
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleClaim(row.offerId)}
                disabled={isPending && pendingId === row.offerId}
              >
                {isPending && pendingId === row.offerId ? 'Claiming…' : 'Claim'}
              </Button>
            )}
          </div>

          {row.claim?.status === 'claimed' && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  Give this code to the buyer to redeem your incentive.
                </p>
                <code className="font-mono text-sm">{row.claim.redemption_code}</code>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Copy redemption code for ${row.title}`}
                  onClick={() => copyCode(row.claim!.redemption_code)}
                >
                  <Copy /> Copy
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove claimed offer ${row.title}`}
                      disabled={isPending && pendingId === row.claim.id}
                    >
                      <Trash2 /> Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this claimed offer?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your redemption code stops working. You can claim the offer again while the
                        buyer still has it open.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep offer</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRemove(row.claim!.id)}>
                        Remove offer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
