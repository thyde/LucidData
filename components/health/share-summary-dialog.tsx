'use client'

import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Share2 } from 'lucide-react'
import { sealShare } from '@luciddata/core/crypto/share-link'
import {
  buildShareSnapshot,
  DEFAULT_SHARE_EXPIRY_DAYS,
  isCalendarDay,
  MAX_SHARE_CIPHERTEXT_LENGTH,
  MAX_SHARE_LABEL_LENGTH,
  MAX_SHARE_NAME_LENGTH,
  MAX_SHARE_NOTE_LENGTH,
  MAX_SHARE_RANGE_DAYS,
  rangeDays,
  SHARE_EXPIRY_OPTIONS,
  shareLink,
  type ShareExpiryDays,
} from '@luciddata/core/health/share'
import { addDays, type MetricId, type MetricSeries } from '@luciddata/core/health/timeline'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { useCreateHealthShare } from '@/lib/hooks/use-health-shares'
import { QrCode } from './qr-code'

const RANGE_PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last year', days: 365 },
  { id: 'custom', label: 'Choose dates', days: null },
] as const

type RangeId = (typeof RANGE_PRESETS)[number]['id']

const EXPIRY_LABELS: Record<ShareExpiryDays, string> = { 1: '1 day', 7: '7 days', 30: '30 days' }

const NOT_SHARED = 'The summary was not shared. Try again.'

interface ShareSummaryDialogProps {
  /** Every metric with something recorded, from the timeline on this device. */
  series: MetricSeries[]
  /** Today where the person is. */
  today: string
}

/** Why a range cannot be shared, or null when it can. */
export function rangeProblem(from: string, to: string, today: string): string | null {
  if (!isCalendarDay(from) || !isCalendarDay(to)) return 'Choose both dates.'
  if (from > to) return 'The start date must be on or before the end date.'
  if (to > today) return 'The end date cannot be after today.'
  if (rangeDays(from, to) > MAX_SHARE_RANGE_DAYS) return 'A share covers a year at most.'
  return null
}

export function ShareSummaryDialog({ series, today }: ShareSummaryDialogProps) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [rangeId, setRangeId] = useState<RangeId>('30')
  const [customFrom, setCustomFrom] = useState(() => addDays(today, -29))
  const [customTo, setCustomTo] = useState(today)
  const [chosen, setChosen] = useState<ReadonlySet<MetricId>>(new Set())
  const [expiresIn, setExpiresIn] = useState<ShareExpiryDays>(DEFAULT_SHARE_EXPIRY_DAYS)
  const [label, setLabel] = useState('')
  const [sharedBy, setSharedBy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ link: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  // Bumped whenever the dialog forgets everything, so a result that arrives
  // afterwards is dropped instead of bringing a link back.
  const attempt = useRef(0)
  const createShare = useCreateHealthShare()

  const preset = RANGE_PRESETS.find((option) => option.id === rangeId) ?? RANGE_PRESETS[1]
  const from = preset.days ? addDays(today, -(preset.days - 1)) : customFrom
  const to = preset.days ? today : customTo
  const problem = rangeProblem(from, to, today)

  const available = useMemo(
    () =>
      problem
        ? []
        : series.flatMap((item) => {
            const days = item.days.filter((day) => day.date >= from && day.date <= to).length
            return days > 0 ? [{ metric: item.metric, days }] : []
          }),
    [series, from, to, problem]
  )
  const selected = available.filter(({ metric }) => chosen.has(metric.id))

  function reset() {
    attempt.current += 1
    setBusy(false)
    setRangeId('30')
    setCustomFrom(addDays(today, -29))
    setCustomTo(today)
    setChosen(new Set())
    setExpiresIn(DEFAULT_SHARE_EXPIRY_DAYS)
    setLabel('')
    setSharedBy('')
    setNote('')
    setError(null)
    setCreated(null)
    setCopied(null)
  }

  /**
   * Every way out of the dialog ends here, so the link and its key never
   * outlive it. While a link is being made the dialog stays open: the share
   * exists once the server answers, and the person needs to see its link.
   */
  function setOpenAndForget(next: boolean) {
    if (!next && busy) return
    setOpen(next)
    if (!next) reset()
  }

  function toggle(metric: MetricId, on: boolean) {
    const next = new Set(chosen)
    if (on) next.add(metric)
    else next.delete(metric)
    setChosen(next)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (problem) {
      setError(problem)
      return
    }
    if (selected.length === 0) {
      setError('Choose at least one figure to share.')
      return
    }
    const mine = attempt.current
    setBusy(true)
    try {
      const snapshot = buildShareSnapshot(series, {
        metrics: selected.map(({ metric }) => metric.id),
        from,
        to,
        sharedBy,
        note,
      })
      const sealed = await sealShare(JSON.stringify(snapshot))
      if (attempt.current !== mine) return
      if (sealed.ciphertext.length > MAX_SHARE_CIPHERTEXT_LENGTH) {
        setError('This summary is too large to share. Choose fewer figures or a shorter range.')
        return
      }
      const share = await createShare.mutateAsync({
        ciphertext: sealed.ciphertext,
        metrics: snapshot.series.map((item) => item.metric),
        rangeStart: from,
        rangeEnd: to,
        expiresInDays: expiresIn,
        label,
      })
      if (attempt.current !== mine) return
      setCreated({ link: shareLink(window.location.origin, share.id, sealed.key), expiresAt: share.expiresAt })
    } catch (caught) {
      if (attempt.current !== mine) return
      // Only a message written for the reader is shown as it is.
      setError(caught instanceof Error && caught.name === 'UserFacingError' ? caught.message : NOT_SHARED)
    } finally {
      if (attempt.current === mine) setBusy(false)
    }
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.link)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpenAndForget}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Share a summary
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Your link is ready</DialogTitle>
              <DialogDescription>
                Send it to the person you are sharing with. LucidData does not keep the key in the link, so this is
                the only time you can copy it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${ids}-link`}>Link</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${ids}-link`}
                    readOnly
                    value={created.link}
                    onFocus={(event) => event.currentTarget.select()}
                    data-testid="share-link"
                  />
                  <Button type="button" onClick={() => void copy()}>
                    {copied === 'yes' ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
                {copied === 'failed' && (
                  <p role="alert" className="text-sm text-destructive">
                    This browser did not allow copying. Select the link and copy it yourself.
                  </p>
                )}
              </div>
              <div className="flex justify-center rounded-md border bg-white p-3">
                <QrCode value={created.link} label="QR code for the link" />
              </div>
              <p className="text-sm text-muted-foreground">
                Scan the code to open the summary on another device. The link stops working on{' '}
                {format(new Date(created.expiresAt), "MMM d, yyyy 'at' h:mm a")}. You can revoke it before then on
                this page.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setOpenAndForget(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-busy={busy} noValidate>
            <DialogHeader>
              <DialogTitle>Share a summary</DialogTitle>
              <DialogDescription>
                Choose the figures and dates to share, and how long the link works. The summary is encrypted on this
                device before LucidData stores it.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor={`${ids}-range`}>Dates</Label>
              <select
                id={`${ids}-range`}
                value={rangeId}
                onChange={(event) => setRangeId(event.target.value as RangeId)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {RANGE_PRESETS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {rangeId === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${ids}-from`}>From</Label>
                    <Input
                      id={`${ids}-from`}
                      type="date"
                      value={customFrom}
                      max={today}
                      onChange={(event) => setCustomFrom(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${ids}-to`}>To</Label>
                    <Input
                      id={`${ids}-to`}
                      type="date"
                      value={customTo}
                      max={today}
                      onChange={(event) => setCustomTo(event.target.value)}
                    />
                  </div>
                </div>
              )}
              {problem && rangeId === 'custom' && <p className="text-sm text-destructive">{problem}</p>}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Figures</legend>
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing is recorded in these dates. Choose other dates.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Only figures with records in these dates are listed.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {available.map(({ metric, days }) => (
                      <div key={metric.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`${ids}-metric-${metric.id}`}
                          checked={chosen.has(metric.id)}
                          onCheckedChange={(state) => toggle(metric.id, state === true)}
                        />
                        <Label htmlFor={`${ids}-metric-${metric.id}`} className="font-normal">
                          {metric.label}{' '}
                          <span className="text-muted-foreground">
                            ({days} {days === 1 ? 'day' : 'days'})
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">The link works for</legend>
              <RadioGroup
                value={String(expiresIn)}
                onValueChange={(value) => setExpiresIn(Number(value) as ShareExpiryDays)}
                className="flex flex-wrap gap-4"
              >
                {SHARE_EXPIRY_OPTIONS.map((days) => (
                  <div key={days} className="flex items-center gap-2">
                    <RadioGroupItem id={`${ids}-expiry-${days}`} value={String(days)} />
                    <Label htmlFor={`${ids}-expiry-${days}`} className="font-normal">
                      {EXPIRY_LABELS[days]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-1">
              <Label htmlFor={`${ids}-label`}>Who is it for? (optional)</Label>
              <Input
                id={`${ids}-label`}
                value={label}
                maxLength={MAX_SHARE_LABEL_LENGTH}
                onChange={(event) => setLabel(event.target.value)}
                aria-describedby={`${ids}-label-hint`}
              />
              <p id={`${ids}-label-hint`} className="text-xs text-muted-foreground">
                For your own list, such as Dr. Patel. The person you share with does not see it, and it is not
                encrypted.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${ids}-name`}>Your name on the summary (optional)</Label>
              <Input
                id={`${ids}-name`}
                value={sharedBy}
                maxLength={MAX_SHARE_NAME_LENGTH}
                onChange={(event) => setSharedBy(event.target.value)}
                aria-describedby={`${ids}-name-hint`}
              />
              <p id={`${ids}-name-hint`} className="text-xs text-muted-foreground">
                Shown to whoever opens the link, and encrypted with the summary.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${ids}-note`}>A note (optional)</Label>
              <Textarea
                id={`${ids}-note`}
                value={note}
                rows={3}
                maxLength={MAX_SHARE_NOTE_LENGTH}
                onChange={(event) => setNote(event.target.value)}
                aria-describedby={`${ids}-note-hint`}
              />
              <p id={`${ids}-note-hint`} className="text-xs text-muted-foreground">
                Shown with the summary, and encrypted with it.
              </p>
            </div>

            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Anyone with the link can open the summary until it expires or you revoke it. They can save or print
              what they see, and revoking cannot take that back.
            </p>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenAndForget(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || selected.length === 0 || Boolean(problem)}>
                {busy ? 'Encrypting' : 'Create link'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
