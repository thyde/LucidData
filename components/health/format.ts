import { format } from 'date-fns'
import type { MetricDefinition, Trend } from '@luciddata/core/health/timeline'

/** A calendar day as a local date, so formatting never moves it across midnight. */
export function localDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** `Sep 14`, or `Sep 14, 2026` with the year. */
export function formatDay(day: string, withYear = false): string {
  return format(localDate(day), withYear ? 'MMM d, yyyy' : 'MMM d')
}

/** A metric's value with its unit, such as `8,412 steps` or `7 h 24 min`. */
export function formatValue(metric: MetricDefinition, value: number): string {
  if (metric.unit === 'h') {
    const minutes = Math.round(value * 60)
    const hours = Math.floor(minutes / 60)
    return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
  }
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: metric.decimals }).format(value)
  return metric.unit === '%' ? `${number}%` : `${number} ${metric.unit}`
}

/** How the last seven days compare with the seven before, without judging the change. */
export function describeTrend(metric: MetricDefinition, trend: Trend): string {
  const recent = metric.absentIsZero
    ? `Last 7 days: ${formatValue(metric, trend.recent)} in total`
    : `Average over the last 7 days: ${formatValue(metric, trend.recent)}`
  const percent = Math.round(Math.abs(trend.change) * 100)
  if (percent === 0) return `${recent}, about the same as the 7 days before.`
  return `${recent}, ${trend.change > 0 ? 'up' : 'down'} ${percent}% on the 7 days before.`
}
