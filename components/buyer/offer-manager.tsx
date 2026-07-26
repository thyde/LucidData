'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { closeOfferAction, redeemOfferClaimAction } from '@/lib/actions/offer.actions'
import { categoryLabel } from '@/components/dashboard/chart-theme'
import type { OfferClaimStats } from '@/lib/services/offer.service'
import type { Offer } from '@/types/database.types'

interface OfferManagerProps {
  orgId: string
  initialOffers: Offer[]
  claimStats: OfferClaimStats[]
}

export function OfferManager({ orgId, initialOffers, claimStats }: OfferManagerProps) {
  const { toast } = useToast()
  const [offers, setOffers] = useState(initialOffers)
  const [stats, setStats] = useState(claimStats)
  const [code, setCode] = useState('')
  const [redeemed, setRedeemed] = useState<{ title: string; incentive: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function redeemCode() {
    startTransition(async () => {
      try {
        const claim = await redeemOfferClaimAction(orgId, code)
        setCode('')
        setRedeemed({ title: claim.offer_title, incentive: claim.incentive })
        setStats((current) =>
          current.map((stat) =>
            stat.offerId === claim.offer_id
              ? { ...stat, claimed: Math.max(stat.claimed - 1, 0), redeemed: stat.redeemed + 1 }
              : stat
          )
        )
        toast({ title: 'Offer redeemed' })
      } catch (error) {
        setRedeemed(null)
        toast({
          title: 'Could not redeem offer',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function closeOffer(offerId: string) {
    startTransition(async () => {
      try {
        const closed = await closeOfferAction(orgId, offerId)
        setOffers((current) => current.map((offer) => (offer.id === closed.id ? closed : offer)))
        toast({ title: 'Offer closed' })
      } catch (error) {
        toast({
          title: 'Could not close offer',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="offer-redemption-code">Redemption code</Label>
            <Input
              id="offer-redemption-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="LC-XXXXXXXXXXXX"
            />
          </div>
          <Button onClick={redeemCode} disabled={isPending || code.trim().length === 0}>
            <CheckCircle2 /> Redeem code
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          People who claim your offer get a one-time code. Redeeming it marks the incentive as
          delivered. The code does not reveal who claimed the offer.
        </p>
        {redeemed && (
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
            <p className="font-medium text-primary">Give this incentive now</p>
            <p className="text-muted-foreground">
              {redeemed.incentive} · {redeemed.title}
            </p>
          </div>
        )}
      </div>

      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No offers yet. Create one to attract people who match a category you need.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {offers.map((offer) => {
            const stat = stats.find((item) => item.offerId === offer.id)
            return (
              <li key={offer.id} className="space-y-3 rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">{categoryLabel(offer.target_category)}</Badge>
                  <Badge variant={offer.status === 'active' ? 'default' : 'outline'}>
                    {offer.status}
                  </Badge>
                </div>
                <div>
                  <p className="font-medium">{offer.title}</p>
                  <p className="text-sm text-muted-foreground">{offer.incentive}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {stat?.claimed ?? 0} awaiting redemption · {stat?.redeemed ?? 0} redeemed
                </p>
                {offer.status === 'active' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" disabled={isPending}>
                        <XCircle /> Close offer
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Close this offer?</AlertDialogTitle>
                        <AlertDialogDescription>
                          People stop seeing it and cannot claim it. Codes that were already claimed
                          stay valid, so you still need to honor them.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it open</AlertDialogCancel>
                        <AlertDialogAction onClick={() => closeOffer(offer.id)}>
                          Close offer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
