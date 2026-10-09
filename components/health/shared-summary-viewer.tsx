'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { openShare, shareKeyFromHash } from '@luciddata/core/crypto/share-link'
import { parseShareSnapshot, sharedSeries, type HealthShareSnapshot } from '@luciddata/core/health/share'
import { sourceLabel, type MetricSeries } from '@luciddata/core/health/timeline'
import { Button } from '@/components/ui/button'
import { MetricCard, sourceText } from './metric-card'
import { formatDay, formatValue } from './format'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'no-key' }
  | { kind: 'missing' }
  | { kind: 'revoked' }
  | { kind: 'expired' }
  | { kind: 'rate-limited' }
  | { kind: 'failed' }
  | { kind: 'unreadable' }
  | { kind: 'open'; snapshot: HealthShareSnapshot; series: MetricSeries[]; expiresAt: string }

const NOTICES: Record<Exclude<ViewState['kind'], 'loading' | 'open'>, { title: string; body: string }> = {
  'no-key': {
    title: 'This link is incomplete',
    body: 'The part of the link after the # sign is missing, and it holds the key that opens the summary. Ask the person who shared it to send the whole link again.',
  },
  missing: {
    title: 'This summary does not exist',
    body: 'Check that you have the whole link, or ask the person who shared it for a new one.',
  },
  revoked: {
    title: 'This summary was revoked',
    body: 'The person who shared it stopped sharing it, and LucidData deleted it.',
  },
  expired: {
    title: 'This link has expired',
    body: 'A shared summary stops opening on the date its owner chose. Ask them to share it again if you still need it.',
  },
  'rate-limited': {
    title: 'Too many requests',
    body: 'Too many summaries were opened from your network in the last hour. Wait a while and try again.',
  },
  failed: {
    title: 'The summary could not be loaded',
    body: 'Check your connection and try again.',
  },
  unreadable: {
    title: 'This link cannot open the summary',
    body: 'The key in the link does not match. Check that you copied the whole link, including everything after the # sign.',
  },
}

async function load(id: string, hash: string): Promise<ViewState> {
  const key = shareKeyFromHash(hash)
  if (!key) return { kind: 'no-key' }
  let response: Response
  try {
    response = await fetch(`/api/share/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    return { kind: 'failed' }
  }
  if (response.status === 404) return { kind: 'missing' }
  if (response.status === 429) return { kind: 'rate-limited' }
  const body = (await response.json().catch(() => null)) as
    | { state?: string; ciphertext?: string; expiresAt?: string }
    | null
  if (response.status === 410) return { kind: body?.state === 'revoked' ? 'revoked' : 'expired' }
  if (!response.ok || body?.state !== 'open' || !body.ciphertext || !body.expiresAt) return { kind: 'failed' }
  try {
    const snapshot = parseShareSnapshot(await openShare(body.ciphertext, key))
    return { kind: 'open', snapshot, series: sharedSeries(snapshot), expiresAt: body.expiresAt }
  } catch {
    return { kind: 'unreadable' }
  }
}

/** Every day of one figure, for the printed copy, where the charts' tables are folded away. */
function PrintedFigures({ series }: { series: MetricSeries }) {
  return (
    <table className="mt-4 hidden w-full break-inside-avoid text-xs print:table">
      <caption className="mb-1 text-left text-sm font-semibold">{series.metric.label} by day</caption>
      <thead>
        <tr className="border-b">
          <th scope="col" className="py-1 text-left font-medium">Date</th>
          <th scope="col" className="py-1 text-left font-medium">{series.metric.label}</th>
          <th scope="col" className="py-1 text-left font-medium">Source</th>
        </tr>
      </thead>
      <tbody>
        {series.days.map((day) => (
          <tr key={day.date} className="border-b">
            <th scope="row" className="py-0.5 text-left font-normal">{formatDay(day.date, true)}</th>
            <td className="py-0.5">{formatValue(series.metric, day.value)}</td>
            <td className="py-0.5">{sourceText(series, day)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SharedSummaryViewer({ id }: { id: string }) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  useEffect(() => {
    let current = true
    let latest = 0
    // The fragment is read here, in the browser, and never sent anywhere.
    const open = () => {
      const ticket = ++latest
      void load(id, window.location.hash).then((next) => {
        if (current && ticket === latest) setState(next)
      })
    }
    // A corrected link pasted into this tab changes only the fragment, and
    // the browser does not reload the page for that.
    const reopen = () => {
      setState({ kind: 'loading' })
      open()
    }
    open()
    window.addEventListener('hashchange', reopen)
    return () => {
      current = false
      window.removeEventListener('hashchange', reopen)
    }
  }, [id, attempt])

  return (
    <div className="min-h-screen bg-muted/20 print:bg-white">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <p className="text-sm">
          <span className="font-semibold">LucidData</span>
          <span className="text-muted-foreground"> · a shared health summary</span>
        </p>

        {state.kind === 'loading' && (
          <div role="status" className="rounded-lg border bg-background p-8 text-center text-muted-foreground">
            Opening the summary
          </div>
        )}

        {state.kind !== 'loading' && state.kind !== 'open' && (
          <div className="rounded-lg border bg-background p-8 text-center" data-testid={`share-${state.kind}`}>
            <h1 className="text-xl font-semibold">{NOTICES[state.kind].title}</h1>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">{NOTICES[state.kind].body}</p>
            {(state.kind === 'failed' || state.kind === 'rate-limited') && (
              <Button className="mt-4" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {state.kind === 'open' && (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold">Health summary</h1>
                <p className="mt-1 text-muted-foreground" data-testid="share-range">
                  {state.snapshot.sharedBy ? `Shared by ${state.snapshot.sharedBy}. ` : ''}
                  Figures from {formatDay(state.snapshot.from, true)} to {formatDay(state.snapshot.to, true)}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Shared on {format(new Date(state.snapshot.createdAt), 'MMM d, yyyy')}. This link stops working on{' '}
                  {format(new Date(state.expiresAt), "MMM d, yyyy 'at' h:mm a")}.
                </p>
              </div>
              <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
                Print or save as PDF
              </Button>
            </div>

            {state.snapshot.note && (
              <figure className="rounded-lg border bg-background p-4">
                <figcaption className="text-sm font-medium">
                  {state.snapshot.sharedBy ? `A note from ${state.snapshot.sharedBy}` : 'A note from the person who shared this'}
                </figcaption>
                <p className="mt-1 whitespace-pre-wrap" data-testid="share-note">
                  {state.snapshot.note}
                </p>
              </figure>
            )}

            <div className="grid gap-4 md:grid-cols-2 print:block">
              {state.series.map((series) => (
                <div key={series.metric.id} className="break-inside-avoid print:mb-6">
                  <MetricCard series={series} from={state.snapshot.from} to={state.snapshot.to} />
                  <PrintedFigures series={series} />
                </div>
              ))}
            </div>

            <section className="space-y-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              <h2 className="font-medium text-foreground">About this summary</h2>
              <p>
                The person who shared it chose these figures and dates. {sourcesSentence(state.series)} They are not a
                medical record.
              </p>
              <p>
                LucidData stored this summary encrypted and cannot read it. The key is in the link you opened, after
                the # sign, and browsers do not send that part of a link to any server.
              </p>
            </section>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground print:hidden">
          Shared through LucidData, an encrypted vault for health records.{' '}
          <Link href="/for-individuals" className="text-primary underline">
            What is LucidData?
          </Link>
        </p>
      </div>
    </div>
  )
}

/** Where the figures came from, by name, for the note at the foot of the page. */
export function sourcesSentence(series: MetricSeries[]): string {
  const sources = new Set(series.flatMap((item) => item.days.flatMap((day) => day.sources)))
  const typed = sources.delete('manual')
  const names = [...sources].map(sourceLabel)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  if (!list) return 'The person typed them in themselves.'
  return typed ? `They come from ${list}, and from what the person typed in.` : `They come from ${list}.`
}
