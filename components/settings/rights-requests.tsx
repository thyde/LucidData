'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'
import { unwrap } from '@/lib/actions/unwrap'
import {
  appealRightsCaseAction,
  fileRightsRequestAction,
  withdrawRightsCaseAction,
} from '@/lib/actions/rights.actions'
import {
  RIGHTS_TYPE_DESCRIPTIONS,
  RIGHTS_TYPE_LABELS,
  type RightsRequestType,
} from '@/lib/validations/rights'
import { JURISDICTION_RULES, RIGHTS_JURISDICTIONS } from '@/lib/utils/rights-deadlines'
import type { RightsCaseView } from '@/lib/services/rights.service'

const FILEABLE_TYPES: RightsRequestType[] = [
  'access',
  'correction',
  'deletion',
  'restriction',
  'portability',
]

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  verifying: 'Checking it is you',
  in_progress: 'In progress',
  paused: 'Waiting on you',
  fulfilled: 'Done',
  refused: 'Refused',
  appealed: 'Under appeal',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function RightsRequests({
  cases,
  collector = null,
}: {
  cases: RightsCaseView[]
  /** LD-206: a collector the extension detected, escalated in one action. */
  collector?: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState<RightsRequestType>('access')
  const [jurisdiction, setJurisdiction] = useState<string>('eu')
  const [detail, setDetail] = useState(
    collector
      ? `I saw ${collector} collecting data about me while I browsed. Please tell me what you hold about me and where it came from.`
      : ''
  )
  const [appealFor, setAppealFor] = useState<string | null>(null)
  const [appealDetail, setAppealDetail] = useState('')

  function handleFile(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await unwrap(fileRightsRequestAction({ type, jurisdiction, detail: detail || undefined }))
        toast({ title: 'Request filed' })
        setDetail('')
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not file the request',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function handleWithdraw(caseId: string) {
    startTransition(async () => {
      try {
        await unwrap(withdrawRightsCaseAction({ caseId }))
        toast({ title: 'Request withdrawn' })
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not withdraw the request',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function handleAppeal(event: React.FormEvent) {
    event.preventDefault()
    if (!appealFor) return
    startTransition(async () => {
      try {
        await unwrap(appealRightsCaseAction({ caseId: appealFor, detail: appealDetail }))
        toast({ title: 'Appeal filed' })
        setAppealFor(null)
        setAppealDetail('')
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not file the appeal',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4 rounded-lg border p-5">
        <h2 className="text-lg font-medium">File a request</h2>
        {collector && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">Asking {collector} what they hold</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We have drafted the request below. Read it before you send it, and change it if
              the wording is not what you mean. This goes to us, and we forward it, because a
              request has to come from an account we can verify.
            </p>
          </div>
        )}
        <form onSubmit={handleFile} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rights-type">What do you want</Label>
            <select
              id="rights-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value as RightsRequestType)}
            >
              {FILEABLE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RIGHTS_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{RIGHTS_TYPE_DESCRIPTIONS[type]}</p>
            {type === 'deletion' && (
              <p className="text-xs text-muted-foreground">
                You do not have to wait for us. Settings has a delete button that erases your
                account straight away and hands you a signed receipt. Filing here instead
                creates a tracked case with a deadline.
              </p>
            )}
            {type === 'portability' && (
              <p className="text-xs text-muted-foreground">
                Your vault export runs in your browser, so we never see the decrypted contents.
                You can run it yourself from the vault at any time.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rights-jurisdiction">Where you live</Label>
            <select
              id="rights-jurisdiction"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value)}
            >
              {RIGHTS_JURISDICTIONS.map((value) => (
                <option key={value} value={value}>
                  {JURISDICTION_RULES[value].label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              This sets your deadline. {JURISDICTION_RULES[jurisdiction as 'eu'].citation}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rights-detail">Anything we should know (optional)</Label>
            <Textarea
              id="rights-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Filing...' : 'File request'}
          </Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Your requests</h2>
        {cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have not filed a request. When you do, it appears here with its deadline and
            every step we took.
          </p>
        ) : (
          <ul className="space-y-4">
            {cases.map((view) => (
              <li key={view.case.id} className="space-y-3 rounded-lg border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{view.typeLabel}</p>
                    <p className="text-sm text-muted-foreground">
                      Filed {formatDate(view.case.received_at)} · {view.jurisdictionLabel}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                    {STATUS_LABELS[view.case.status] ?? view.case.status}
                  </span>
                </div>

                <p className="text-sm">
                  Due {formatDate(view.case.due_at)}
                  {view.overdue
                    ? ' · overdue'
                    : view.daysRemaining >= 0
                      ? ` · ${view.daysRemaining} day${view.daysRemaining === 1 ? '' : 's'} left`
                      : ''}
                  {view.case.extended_to ? ' · extended' : ''}
                </p>

                {view.case.resolution_note && (
                  <p className="rounded-md bg-muted p-3 text-sm">{view.case.resolution_note}</p>
                )}

                {view.events.length > 0 && (
                  <ol className="space-y-1 border-l pl-4 text-sm text-muted-foreground">
                    {view.events.map((event) => (
                      <li key={event.id}>
                        {formatDate(event.created_at)} · {event.event}
                        {event.detail ? ` · ${event.detail}` : ''}
                      </li>
                    ))}
                  </ol>
                )}

                <div className="flex flex-wrap gap-2">
                  {view.canWithdraw && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleWithdraw(view.case.id)}
                    >
                      Withdraw
                    </Button>
                  )}
                  {view.canAppeal && appealFor !== view.case.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAppealFor(view.case.id)}
                    >
                      Appeal this refusal
                    </Button>
                  )}
                </div>

                {appealFor === view.case.id && (
                  <form onSubmit={handleAppeal} className="space-y-2">
                    <Label htmlFor={`appeal-${view.case.id}`}>Why are you appealing</Label>
                    <Input
                      id={`appeal-${view.case.id}`}
                      value={appealDetail}
                      onChange={(event) => setAppealDetail(event.target.value)}
                      maxLength={2000}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={isPending}>
                        File appeal
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAppealFor(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
