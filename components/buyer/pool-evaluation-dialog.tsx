'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import { evaluatePoolAction } from '@/lib/actions/marketplace.actions'
import { formatCents } from '@/components/dashboard/chart-theme'
import type { PoolEvaluation } from '@/lib/services/pool-evaluation.service'

/**
 * LD-503: what a buyer would actually receive, shown before they pay.
 *
 * The privacy panel is the important part. A pool can hold plenty of records
 * and still deliver almost nothing useful, because reaching the cohort size
 * required generalizing every distinguishing field away. Finding that out
 * after the charge is the problem this dialog exists to prevent.
 */
export function PoolEvaluationDialog({
  orgId,
  poolId,
  poolName,
}: {
  orgId: string
  poolId: string
  poolName: string
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [evaluation, setEvaluation] = useState<PoolEvaluation | null>(null)

  function load() {
    setOpen(true)
    startTransition(async () => {
      try {
        setEvaluation(await evaluatePoolAction(orgId, poolId))
      } catch (error) {
        toast({
          title: 'Could not evaluate this pool',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
        setOpen(false)
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={load}>
        Evaluate
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{poolName}</DialogTitle>
            <DialogDescription>
              What this dataset would deliver today, and what it would withhold.
            </DialogDescription>
          </DialogHeader>

          {isPending && !evaluation && (
            <p className="text-sm text-muted-foreground">Evaluating...</p>
          )}

          {evaluation && (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Contributors" value={evaluation.contributorBand} />
                <Metric label="Records held" value={String(evaluation.recordCount)} />
                <Metric
                  label="Records offered"
                  value={
                    evaluation.privacy.releasable
                      ? String(evaluation.privacy.recordsOffered)
                      : 'None'
                  }
                />
                <Metric
                  label="Estimated price"
                  value={formatCents(evaluation.estimatedTotalCents)}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Privacy outcome</h3>
                {evaluation.privacy.releasable ? (
                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="text-sm">
                      Every record you receive shares its identifying details with at least{' '}
                      <span className="font-medium">{evaluation.privacy.k - 1}</span> other
                      people. Your pool asks for {evaluation.privacy.kTarget}.
                    </p>
                    {evaluation.privacy.recordsSuppressed > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {evaluation.privacy.recordsSuppressed} record
                        {evaluation.privacy.recordsSuppressed === 1 ? ' is' : 's are'} withheld
                        because they could not be grouped with enough others.
                      </p>
                    )}
                    {evaluation.privacy.generalizations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium">How fields are widened</p>
                        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                          {evaluation.privacy.generalizations.map((entry) => (
                            <li key={entry.field}>
                              {entry.field}: {entry.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evaluation.privacy.identifiersDropped.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Never delivered:{' '}
                        {evaluation.privacy.identifiersDropped.join(', ')}.
                      </p>
                    )}
                    {evaluation.privacy.unclassifiedSuppressed.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Withheld because nobody has classified them:{' '}
                        {evaluation.privacy.unclassifiedSuppressed.join(', ')}.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    <p className="font-medium">This dataset cannot be released yet.</p>
                    <p className="mt-1">{evaluation.privacy.reason}</p>
                    <p className="mt-1">
                      A purchase would be refused for the same reason, so nothing is charged.
                    </p>
                  </div>
                )}
              </section>

              {evaluation.coverage.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Field coverage</h3>
                  <ul className="divide-y rounded-lg border text-sm">
                    {evaluation.coverage.map((entry) => (
                      <li
                        key={entry.field}
                        className="flex items-center justify-between px-4 py-2"
                      >
                        <span>{entry.field}</span>
                        <span className="text-muted-foreground">
                          {Math.round(entry.coverage * 100)}% of records
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {evaluation.freshness.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">How recent the data is</h3>
                  <ul className="divide-y rounded-lg border text-sm">
                    {evaluation.freshness.map((entry) => (
                      <li
                        key={entry.bucket}
                        className="flex items-center justify-between px-4 py-2"
                      >
                        <span>{entry.label}</span>
                        <span className="text-muted-foreground">{entry.records} records</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {Object.entries(evaluation.deliverableFields).map(([schemaType, fields]) => (
                <section key={schemaType} className="space-y-2">
                  <h3 className="text-sm font-medium">Fields in {schemaType}</h3>
                  <ul className="divide-y rounded-lg border text-sm">
                    {fields.map((field) => (
                      <li key={field.field} className="flex items-start gap-3 px-4 py-2">
                        <Badge variant={field.delivered ? 'default' : 'outline'}>
                          {field.delivered ? 'Delivered' : 'Withheld'}
                        </Badge>
                        <div>
                          <p>{field.label}</p>
                          <p className="text-xs text-muted-foreground">{field.note}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {Object.entries(evaluation.samples).map(([schemaType, samples]) => (
                <section key={schemaType} className="space-y-2">
                  <h3 className="text-sm font-medium">Sample records ({schemaType})</h3>
                  <p className="text-xs text-muted-foreground">
                    {evaluation.syntheticNotice}
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs">
                    {JSON.stringify(
                      samples.map((sample) => sample.values),
                      null,
                      2
                    )}
                  </pre>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
