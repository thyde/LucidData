import { describe, expect, it } from 'vitest'
import { METRICS, type MetricId } from '@luciddata/core/health/timeline'
import { describeTrend, formatDay, formatValue } from '../format'

const metric = (id: MetricId) => METRICS.find((item) => item.id === id)!

describe('formatDay', () => {
  it('keeps the calendar day whatever the time zone', () => {
    // Parsed as UTC midnight, this would read as Sep 13 anywhere west of London.
    expect(formatDay('2026-09-14')).toBe('Sep 14')
    expect(formatDay('2026-09-14', true)).toBe('Sep 14, 2026')
  })
})

describe('formatValue', () => {
  it('writes each unit the way people read it', () => {
    expect(formatValue(metric('steps'), 8412)).toBe('8,412 steps')
    expect(formatValue(metric('distance_km'), 5.234)).toBe('5.2 km')
    expect(formatValue(metric('blood_oxygen'), 96.5)).toBe('96.5%')
    expect(formatValue(metric('sleep_hours'), 7.4)).toBe('7 h 24 min')
    expect(formatValue(metric('sleep_hours'), 0.5)).toBe('30 min')
    expect(formatValue(metric('resting_heart_rate'), 56.4)).toBe('56 bpm')
  })
})

describe('describeTrend', () => {
  it('says which way a figure moved, and by how much', () => {
    expect(describeTrend(metric('steps'), { recent: 9000, previous: 8000, change: 0.125 })).toBe(
      'Average over the last 7 days: 9,000 steps, up 13% on the 7 days before.'
    )
    expect(describeTrend(metric('resting_heart_rate'), { recent: 54, previous: 56, change: -0.0357 })).toBe(
      'Average over the last 7 days: 54 bpm, down 4% on the 7 days before.'
    )
    expect(describeTrend(metric('weight_kg'), { recent: 72.1, previous: 72.2, change: -0.0014 })).toBe(
      'Average over the last 7 days: 72.1 kg, about the same as the 7 days before.'
    )
    // Workouts compare totals, since a day without one had none.
    expect(describeTrend(metric('workout_minutes'), { recent: 120, previous: 150, change: -0.2 })).toBe(
      'Last 7 days: 120 min in total, down 20% on the 7 days before.'
    )
  })
})
