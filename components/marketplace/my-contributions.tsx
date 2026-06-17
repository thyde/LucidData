'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { withdrawContributionAction } from '@/lib/actions/contribution.actions'
import { categoryLabel, formatCents } from '@/components/dashboard/chart-theme'
import type { PoolContribution } from '@/types/database.types'

export function MyContributions({ contributions }: { contributions: PoolContribution[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (contributions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t shared any data yet. Contribute to a pool to start earning.
      </p>
    )
  }

  function handleWithdraw(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        await withdrawContributionAction(id)
        toast({ title: 'Contribution withdrawn' })
        router.refresh()
      } catch {
        toast({ title: 'Could not withdraw', variant: 'destructive' })
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Fields</TableHead>
          <TableHead>Payout/record</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contributions.map((c) => {
          const fieldCount =
            c.anonymized_payload && typeof c.anonymized_payload === 'object'
              ? Object.keys(c.anonymized_payload as Record<string, unknown>).length
              : 0
          return (
            <TableRow key={c.id}>
              <TableCell>{categoryLabel(c.category)}</TableCell>
              <TableCell>{fieldCount}</TableCell>
              <TableCell>{formatCents(c.payout_cents)}</TableCell>
              <TableCell>
                <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {c.status === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWithdraw(c.id)}
                    disabled={isPending && pendingId === c.id}
                  >
                    {isPending && pendingId === c.id ? 'Withdrawing…' : 'Withdraw'}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
