'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { addDays, sourceLabel, type DayValue, type MetricSeries } from '@luciddata/core/health/timeline'
import { describeTrend, formatDay, formatValue } from './format'

/** Readings of the body, drawn as points over time rather than as daily totals. */
const LINE_METRICS = new Set(['resting_heart_rate', 'heart_rate_variability', 'blood_oxygen', 'respiratory_rate', 'weight_kg'])

const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }

interface Point {
  date: string
  value: number | null
  source: string | null
}

/** Past this many days a chart draws one point a week, or a decade of bars would be too thin to see. */
export const DAILY_LIMIT = 366

const DAY_MS = 24 * 60 * 60 * 1000

/** The Monday of the week a day falls in. */
function weekOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const index = Date.UTC(year, month - 1, date) / DAY_MS
  // 1 January 1970 was a Thursday, three days after a Monday.
  return addDays(day, -((index + 3) % 7))
}

/** Whether a range is long enough to draw by the week. */
export function drawnWeekly(from: string, to: string): boolean {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1 > DAILY_LIMIT
}

/**
 * One point a day across the range, or one a week for a long range, null where
 * nothing was recorded so a chart shows the gap. A week's point is the average
 * of its days with a value, or its total where a quiet day counts as zero.
 */
export function pointsFor(days: readonly DayValue[], from: string, to: string, weeklyTotal = false): Point[] {
  const points: Point[] = []
  const byDate = new Map(days.map((day) => [day.date, day]))
  if (!drawnWeekly(from, to)) {
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const day = byDate.get(date)
      points.push({ date, value: day?.value ?? null, source: day?.source ?? null })
    }
    return points
  }
  const weeks = new Map<string, number[]>()
  for (const day of days) {
    const week = weekOf(day.date)
    weeks.set(week, [...(weeks.get(week) ?? []), day.value])
  }
  for (let week = weekOf(from); week <= to; week = addDays(week, 7)) {
    const values = weeks.get(week)
    const total = values ? values.reduce((sum, value) => sum + value, 0) : null
    points.push({
      date: week,
      value: values && total !== null ? (weeklyTotal ? total : total / values.length) : null,
      source: null,
    })
  }
  return points
}

/** Which source a day's value came from, and which others recorded the day but were not added. */
export function sourceText(series: MetricSeries, day: DayValue): string {
  if (series.metric.combine === 'sum') return day.sources.map(sourceLabel).join(', ')
  const others = day.sources.filter((source) => source !== day.source).map(sourceLabel)
  const chosen = sourceLabel(day.source)
  return others.length > 0 ? `${chosen} (also in ${others.join(', ')}, not added)` : chosen
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

function PointTooltip({
  active,
  payload,
  metric,
  weekly,
}: TooltipContentProps & { metric: MetricSeries['metric']; weekly: boolean }) {
  const point = payload?.[0]?.payload as Point | undefined
  if (!active || !point || point.value === null) return null
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{weekly ? `Week of ${formatDay(point.date, true)}` : formatDay(point.date, true)}</p>
      <p>
        {formatValue(metric, point.value)}
        {weekly && (metric.absentIsZero ? ' that week' : ' a day on average')}
      </p>
      {point.source && <p className="text-muted-foreground">From {sourceLabel(point.source)}</p>}
    </div>
  )
}

interface MetricCardProps {
  series: MetricSeries
  from: string
  to: string
}

export function MetricCard({ series, from, to }: MetricCardProps) {
  const { metric, days, latest, trend } = series
  const [showNumbers, setShowNumbers] = useState(false)
  const points = useMemo(() => pointsFor(days, from, to, metric.absentIsZero), [days, from, to, metric.absentIsZero])
  const weekly = drawnWeekly(from, to)
  const asLine = LINE_METRICS.has(metric.id)
  const tickFormat = (day: string) => formatDay(day, weekly)

  const chart = asLine ? (
    <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey="date" tickFormatter={tickFormat} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
      <YAxis domain={['auto', 'auto']} tickFormatter={(value: number) => compact.format(value)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
      <Tooltip content={(props) => <PointTooltip {...props} metric={metric} weekly={weekly} />} />
      <Line
        type="monotone"
        dataKey="value"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        dot={{ r: 2 }}
        connectNulls={false}
        isAnimationActive={false}
      />
    </LineChart>
  ) : (
    <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey="date" tickFormatter={tickFormat} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
      <YAxis tickFormatter={(value: number) => compact.format(value)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
      <Tooltip content={(props) => <PointTooltip {...props} metric={metric} weekly={weekly} />} cursor={{ fill: 'hsl(var(--muted))' }} />
      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} isAnimationActive={false} />
    </BarChart>
  )

  return (
    <Card data-testid={`metric-${metric.id}`}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle role="heading" aria-level={2} className="text-base">
          {metric.label}
        </CardTitle>
        {latest && (
          <>
            <p className="text-2xl font-semibold" data-testid="metric-latest">
              {formatValue(metric, latest.value)}
            </p>
            <CardDescription>
              {formatDay(latest.date, true)}, from {sourceLabel(latest.source)}
            </CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {trend && <p className="text-sm">{describeTrend(metric, trend)}</p>}
        {/* The table below carries the same figures for screen readers and the keyboard. */}
        <div className="h-40 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 480, height: 160 }}>
            {chart}
          </ResponsiveContainer>
        </div>
        <details onToggle={(event) => setShowNumbers(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">
            Show the numbers
          </summary>
          {showNumbers && (
            // Focusable, so the rows can be scrolled from the keyboard.
            <div
              className="mt-2 max-h-72 overflow-y-auto rounded-md border"
              role="region"
              aria-label={`${metric.label} by day`}
              tabIndex={0}
            >
              <table className="w-full text-sm">
                <caption className="sr-only">{metric.label} each day, newest first, with where each value came from</caption>
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      {metric.label}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...days].reverse().map((day) => (
                    <tr key={day.date}>
                      <th scope="row" className="px-3 py-1.5 text-left font-normal">
                        {formatDay(day.date, true)}
                      </th>
                      <td className="px-3 py-1.5">{formatValue(metric, day.value)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{sourceText(series, day)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </CardContent>
    </Card>
  )
}
