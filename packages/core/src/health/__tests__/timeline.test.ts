import { describe, expect, it } from 'vitest'
import { addDays, buildTimeline, dayOf, sourceLabel, type MetricId, type TimelineEntry } from '../timeline'

const daily = (provider: string | null, date: string, data: Record<string, unknown>): TimelineEntry => ({
  schemaType: 'fitness_daily',
  data: { date, ...data },
  provider,
})

function series(entries: TimelineEntry[], metric: MetricId, options = {}) {
  return buildTimeline(entries, { timeZone: 'America/New_York', ...options }).find((item) => item.metric.id === metric)!
}

describe('buildTimeline', () => {
  it('takes one source a day, never the sum of two that counted the same steps', () => {
    const steps = series(
      [
        daily('apple-health', '2026-09-14', { steps: 9000 }),
        daily('garmin', '2026-09-14', { steps: 9400 }),
        daily('apple-health', '2026-09-15', { steps: 7000 }),
      ],
      'steps'
    )

    expect(steps.days).toEqual([
      { date: '2026-09-14', value: 9400, source: 'garmin', sources: ['garmin', 'apple-health'] },
      { date: '2026-09-15', value: 7000, source: 'apple-health', sources: ['apple-health'] },
    ])
  })

  it('prefers a value the person typed over any import', () => {
    const weight = series(
      [
        { schemaType: 'body_measurement', data: { date: '2026-09-14', weight_kg: 72.4 }, provider: 'apple-health' },
        { schemaType: 'body_measurement', data: { date: '2026-09-14', weight_kg: 71.9 }, provider: null },
      ],
      'weight_kg'
    )
    expect(weight.days).toEqual([{ date: '2026-09-14', value: 71.9, source: 'manual', sources: ['manual', 'apple-health'] }])
    expect(sourceLabel('manual')).toBe('Entered by you')
    expect(sourceLabel('apple-health')).toBe('Apple Health')
  })

  it('leaves days with no value out, so a chart shows a gap', () => {
    const heart = series(
      [
        { schemaType: 'vitals_daily', data: { date: '2026-09-10', resting_heart_rate: 55 }, provider: 'garmin' },
        { schemaType: 'vitals_daily', data: { date: '2026-09-13', resting_heart_rate: 57 }, provider: 'garmin' },
      ],
      'resting_heart_rate'
    )
    expect(heart.days.map((day) => day.date)).toEqual(['2026-09-10', '2026-09-13'])
    expect(heart.latest).toMatchObject({ date: '2026-09-13', value: 57 })
  })

  it('counts a workout two sources recorded once, and adds up a day of different ones', () => {
    const workouts = series(
      [
        // The same run from the watch, from Strava, and from Apple Health's copy.
        { schemaType: 'fitness_activity', data: { start_date: '2026-09-14T10:30:00Z', duration_min: 30 }, provider: 'garmin' },
        {
          schemaType: 'fitness_activity',
          data: { start_date: '2026-09-14', duration_min: 31 },
          provider: 'strava',
          capturedAt: '2026-09-14T10:32:10Z',
        },
        { schemaType: 'fitness_activity', data: { start_date: '2026-09-14T06:31:00-04:00', duration_min: 30.5 }, provider: 'apple-health' },
        // A ride later the same day is a different workout.
        { schemaType: 'fitness_activity', data: { start_date: '2026-09-14T21:00:00Z', duration_min: 45 }, provider: 'strava' },
      ],
      'workout_minutes'
    )
    expect(workouts.days).toEqual([
      { date: '2026-09-14', value: 75, source: 'garmin', sources: ['garmin', 'strava'] },
    ])
  })

  it('puts a night on the morning it ends, and adds a nap from the same source', () => {
    const sleep = series(
      [
        { schemaType: 'sleep_session', data: { start: '2026-09-13T23:10:00-04:00', end: '2026-09-14T06:40:00-04:00', asleep_min: 420 }, provider: 'apple-health' },
        { schemaType: 'sleep_session', data: { start: '2026-09-14T14:00:00-04:00', end: '2026-09-14T14:30:00-04:00', asleep_min: 30 }, provider: 'apple-health' },
        // Garmin's copy of the same night, written in UTC.
        { schemaType: 'sleep_session', data: { start: '2026-09-14T03:12:00Z', end: '2026-09-14T10:41:00Z', asleep_min: 415 }, provider: 'garmin' },
      ],
      'sleep_hours'
    )
    // Garmin's night, once, and the nap only Apple Health recorded.
    expect(sleep.days).toEqual([{ date: '2026-09-14', value: 7.4, source: 'garmin', sources: ['garmin', 'apple-health'] }])
  })

  it('compares the last seven days with the seven before', () => {
    const entries = Array.from({ length: 14 }, (_, index) =>
      daily('garmin', addDays('2026-09-01', index), { steps: index < 7 ? 8000 : 9000 })
    )
    const steps = series(entries, 'steps', { to: '2026-09-14' })
    expect(steps.trend).toEqual({ recent: 9000, previous: 8000, change: 0.125 })

    // Without two readings on each side there is nothing to compare.
    expect(series(entries.slice(-3), 'steps', { to: '2026-09-14' }).trend).toBeNull()
  })

  it("treats Strava's archive as Strava, and matches its activities against the connector's", () => {
    const workouts = series(
      [
        { schemaType: 'fitness_activity', data: { start_date: '2026-09-14', duration_min: 31 }, provider: 'strava', capturedAt: '2026-09-14T10:32:10Z' },
        { schemaType: 'fitness_activity', data: { start_date: '2026-09-14', duration_min: 31 }, provider: 'strava-archive', capturedAt: '2026-09-14T10:32:10Z' },
      ],
      'workout_minutes'
    )
    expect(workouts.days).toEqual([{ date: '2026-09-14', value: 31, source: 'strava', sources: ['strava'] }])
    expect(sourceLabel('strava-archive')).toBe('Strava')
  })

  it("leaves out the energy Fitbit's connector stored, which was everything burned rather than active energy", () => {
    const energy = series(
      [
        daily('fitbit', '2026-09-14', { calories_out: 2350, steps: 9000 }),
        daily('garmin', '2026-09-15', { calories_out: 540 }),
      ],
      'active_calories'
    )
    expect(energy.days).toEqual([{ date: '2026-09-15', value: 540, source: 'garmin', sources: ['garmin'] }])
    // Its steps still count.
    expect(series([daily('fitbit', '2026-09-14', { calories_out: 2350, steps: 9000 })], 'steps').days).toHaveLength(1)
  })

  it('keeps to the range asked for', () => {
    const steps = series(
      [daily('garmin', '2026-08-31', { steps: 1 }), daily('garmin', '2026-09-01', { steps: 2 }), daily('garmin', '2026-09-02', { steps: 3 })],
      'steps',
      { from: '2026-09-01', to: '2026-09-01' }
    )
    expect(steps.days.map((day) => day.value)).toEqual([2])
  })

  it('ignores entries it cannot read rather than failing on them', () => {
    const timeline = buildTimeline([
      { schemaType: 'fitness_daily', data: null, provider: 'garmin' },
      { schemaType: null, data: { date: '2026-09-14', steps: 10 }, provider: 'garmin' },
      daily('garmin', 'yesterday', { steps: 10 }),
      daily('garmin', '2026-09-14', { steps: 'many' }),
      { schemaType: 'medical_basic', data: { full_name: 'Sam' }, provider: null },
    ])
    expect(timeline.every((item) => item.days.length === 0)).toBe(true)
  })
})

describe('dayOf', () => {
  it('keeps a written offset, and places UTC in the reader\'s time zone', () => {
    expect(dayOf('2026-09-14')).toBe('2026-09-14')
    expect(dayOf('2026-09-14T23:30:00-07:00', 'Asia/Tokyo')).toBe('2026-09-14')
    expect(dayOf('2026-09-15T02:30:00Z', 'America/New_York')).toBe('2026-09-14')
    expect(dayOf('2026-09-15T02:30:00Z', 'Europe/Berlin')).toBe('2026-09-15')
    expect(dayOf('not a date')).toBeNull()
    expect(dayOf(42)).toBeNull()
  })
})
