import { describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { buildTimeline, type TimelineEntry } from '../timeline'
import {
  buildShareSnapshot,
  isCalendarDay,
  isLinkShareConsent,
  parseShareSnapshot,
  rangeDays,
  shareLink,
  sharedSeries,
  type HealthShareSnapshot,
} from '../share'
import { openShare, sealShare } from '../../crypto/share-link'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const daily = (provider: string | null, date: string, data: Record<string, unknown>): TimelineEntry => ({
  schemaType: 'fitness_daily',
  data: { date, ...data },
  provider,
})

const timeline = buildTimeline(
  [
    daily('garmin', '2026-08-31', { steps: 5000 }),
    daily('garmin', '2026-09-01', { steps: 9400, resting_heart_rate: 58 }),
    daily('apple-health', '2026-09-01', { steps: 9000 }),
    daily('apple-health', '2026-09-02', { steps: 7000 }),
    { schemaType: 'body_measurement', data: { date: '2026-09-02', weight_kg: 71.9 }, provider: null },
  ],
  { timeZone: 'America/New_York', to: '2026-09-30' }
)

const NOW = new Date('2026-10-01T12:00:00.000Z')

function snapshot(overrides: Partial<Parameters<typeof buildShareSnapshot>[1]> = {}): HealthShareSnapshot {
  return buildShareSnapshot(timeline, {
    metrics: ['steps', 'resting_heart_rate'],
    from: '2026-09-01',
    to: '2026-09-30',
    now: NOW,
    ...overrides,
  })
}

describe('buildShareSnapshot', () => {
  it('keeps only the chosen figures, inside the chosen dates', () => {
    expect(snapshot()).toEqual({
      version: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
      from: '2026-09-01',
      to: '2026-09-30',
      sharedBy: null,
      note: null,
      series: [
        {
          metric: 'steps',
          days: [
            ['2026-09-01', 9400, ['garmin', 'apple-health']],
            ['2026-09-02', 7000, ['apple-health']],
          ],
        },
        { metric: 'resting_heart_rate', days: [['2026-09-01', 58, ['garmin']]] },
      ],
    })
  })

  it('leaves out a chosen figure with nothing in the range', () => {
    const shared = snapshot({ metrics: ['steps', 'sleep_hours'] })
    expect(shared.series.map((item) => item.metric)).toEqual(['steps'])
  })

  it('never includes a figure that was not chosen', () => {
    const shared = snapshot({ metrics: ['steps'] })
    expect(JSON.stringify(shared)).not.toContain('71.9')
    expect(JSON.stringify(shared)).not.toContain('weight')
  })

  it('trims the name and note, and drops them when blank', () => {
    expect(snapshot({ sharedBy: '  Alex  ', note: ' Since the new medication \n' })).toMatchObject({
      sharedBy: 'Alex',
      note: 'Since the new medication',
    })
    expect(snapshot({ sharedBy: '   ', note: '' })).toMatchObject({ sharedBy: null, note: null })
  })
})

describe('parseShareSnapshot', () => {
  it('reads back what was built', () => {
    const built = snapshot({ sharedBy: 'Alex', note: 'Line one\nLine two' })
    expect(parseShareSnapshot(JSON.stringify(built))).toEqual(built)
  })

  it('survives the trip through a link key', async () => {
    const built = snapshot({ note: 'Encrypted on this device' })
    const sealed = await sealShare(JSON.stringify(built))
    expect(sealed.ciphertext).not.toContain('Encrypted on this device')
    expect(parseShareSnapshot(await openShare(sealed.ciphertext, sealed.key))).toEqual(built)
  })

  const valid = snapshot()
  const refused: [string, unknown][] = [
    ['an unknown field', { ...valid, extra: true }],
    ['another version', { ...valid, version: 2 }],
    ['a figure it does not know', { ...valid, series: [{ metric: 'secret', days: [['2026-09-01', 1, ['x']]] }] }],
    ['a figure twice', { ...valid, series: [valid.series[0], valid.series[0]] }],
    ['a day outside the range', { ...valid, series: [{ metric: 'steps', days: [['2026-10-05', 1, ['garmin']]] }] }],
    ['a day that does not exist', { ...valid, series: [{ metric: 'steps', days: [['2026-09-31', 1, ['garmin']]] }] }],
    ['a range longer than a year', { ...valid, from: '2025-01-01' }],
    ['a range that ends before it starts', { ...valid, from: '2026-10-01', to: '2026-09-01' }],
    ['a day without a source', { ...valid, series: [{ metric: 'steps', days: [['2026-09-01', 1, []]] }] }],
    ['a value that is not a number', { ...valid, series: [{ metric: 'steps', days: [['2026-09-01', '1', ['garmin']]] }] }],
    ['an empty note', { ...valid, note: '' }],
    ['a note too long', { ...valid, note: 'x'.repeat(1001) }],
    ['no figures', { ...valid, series: [] }],
  ]
  it.each(refused)('refuses %s', (_, value) => {
    expect(() => parseShareSnapshot(JSON.stringify(value))).toThrow()
  })

  it('refuses text that is not JSON', () => {
    expect(() => parseShareSnapshot('not json')).toThrow()
  })
})

describe('sharedSeries', () => {
  it('rebuilds the series the charts draw, without a trend', () => {
    const [steps, heart] = sharedSeries(snapshot())
    expect(steps.metric.label).toBe('Steps')
    expect(steps.days).toEqual([
      { date: '2026-09-01', value: 9400, source: 'garmin', sources: ['garmin', 'apple-health'] },
      { date: '2026-09-02', value: 7000, source: 'apple-health', sources: ['apple-health'] },
    ])
    expect(steps.latest).toEqual(steps.days[1])
    expect(steps.trend).toBeNull()
    expect(heart.metric.id).toBe('resting_heart_rate')
  })
})

describe('links and helpers', () => {
  const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

  it('puts the key after the #', () => {
    expect(shareLink('https://luciddatabank.com/', 'abc', key)).toBe(`https://luciddatabank.com/share/abc#${key}`)
  })

  it('counts both ends of a range', () => {
    expect(rangeDays('2026-09-01', '2026-09-30')).toBe(30)
    expect(rangeDays('2026-09-01', '2026-09-01')).toBe(1)
    expect(rangeDays('2024-01-01', '2024-12-31')).toBe(366)
  })

  it('knows a real calendar day', () => {
    expect(isCalendarDay('2024-02-29')).toBe(true)
    expect(isCalendarDay('2026-02-29')).toBe(false)
    expect(isCalendarDay('2026-9-01')).toBe(false)
    expect(isCalendarDay('2026-09-01T00:00:00Z')).toBe(false)
  })

  it('tells a link share from a grant to an organization', () => {
    expect(isLinkShareConsent({ granted_to: 'link:00000000-0000-4000-8000-000000000001' })).toBe(true)
    expect(isLinkShareConsent({ granted_to: 'org-1' })).toBe(false)
  })
})
