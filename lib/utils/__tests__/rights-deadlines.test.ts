import { describe, it, expect } from 'vitest'
import {
  JURISDICTION_RULES,
  RIGHTS_JURISDICTIONS,
  addDays,
  addMonths,
  computeDeadline,
  daysRemaining,
  isJurisdiction,
  isOverdue,
} from '@/lib/utils/rights-deadlines'

const iso = (date: Date) => date.toISOString().slice(0, 10)

describe('addMonths', () => {
  // "One month" is the same date next month, not 30 days. These are the cases
  // that get a compliance deadline wrong by days.
  it.each([
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-30', 1, '2026-02-28'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-08-31', 1, '2026-09-30'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2024-11-30', 3, '2025-02-28'],
    ['2023-11-30', 3, '2024-02-29'],
  ])('%s plus %i month(s) is %s', (from, months, expected) => {
    expect(iso(addMonths(new Date(`${from}T00:00:00.000Z`), months))).toBe(expected)
  })

  it('keeps the time of day', () => {
    const from = new Date('2026-01-15T13:45:30.500Z')
    expect(addMonths(from, 1).toISOString()).toBe('2026-02-15T13:45:30.500Z')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(iso(addDays(new Date('2026-01-20T00:00:00.000Z'), 45))).toBe('2026-03-06')
  })

  it('crosses a leap day', () => {
    expect(iso(addDays(new Date('2024-02-01T00:00:00.000Z'), 45))).toBe('2024-03-17')
  })
})

describe('jurisdiction rules', () => {
  it('covers every declared jurisdiction', () => {
    for (const jurisdiction of RIGHTS_JURISDICTIONS) {
      expect(JURISDICTION_RULES[jurisdiction]).toBeDefined()
      expect(JURISDICTION_RULES[jurisdiction].citation.length).toBeGreaterThan(5)
    }
  })

  it('recognizes a jurisdiction string and rejects anything else', () => {
    expect(isJurisdiction('uk')).toBe(true)
    expect(isJurisdiction('mars')).toBe(false)
  })
})

describe('computeDeadline', () => {
  const receivedAt = new Date('2026-01-31T09:00:00.000Z')

  it('gives the EU one month from receipt', () => {
    const result = computeDeadline({ jurisdiction: 'eu', receivedAt })
    expect(iso(result.dueAt)).toBe('2026-02-28')
  })

  it('gives the UK the same window', () => {
    const result = computeDeadline({ jurisdiction: 'uk', receivedAt })
    expect(iso(result.dueAt)).toBe('2026-02-28')
  })

  it('gives California 45 days, not one month', () => {
    const result = computeDeadline({ jurisdiction: 'us_ca', receivedAt })
    expect(iso(result.dueAt)).toBe('2026-03-17')
  })

  it('holds an unknown jurisdiction to the strictest window rather than none', () => {
    const result = computeDeadline({ jurisdiction: 'other', receivedAt })
    expect(iso(result.dueAt)).toBe('2026-02-28')
  })

  it('adds two further months on an EU extension', () => {
    const result = computeDeadline({ jurisdiction: 'eu', receivedAt, extended: true })
    expect(iso(result.dueAt)).toBe('2026-04-28')
    expect(result.extended).toBe(true)
  })

  it('adds a further 45 days on a California extension', () => {
    const result = computeDeadline({ jurisdiction: 'us_ca', receivedAt, extended: true })
    expect(iso(result.dueAt)).toBe('2026-05-01')
  })

  it('reports the base deadline alongside the extended one', () => {
    const result = computeDeadline({ jurisdiction: 'eu', receivedAt, extended: true })
    expect(iso(result.baseDueAt)).toBe('2026-02-28')
    expect(result.dueAt.getTime()).toBeGreaterThan(result.baseDueAt.getTime())
  })
})

describe('a paused case does not accrue time', () => {
  const receivedAt = new Date('2026-01-01T00:00:00.000Z')

  it('pushes the deadline out by the length of a completed pause', () => {
    const result = computeDeadline({
      jurisdiction: 'uk',
      receivedAt,
      pauses: [
        {
          pausedAt: new Date('2026-01-05T00:00:00.000Z'),
          resumedAt: new Date('2026-01-15T00:00:00.000Z'),
        },
      ],
    })
    // One month from 1 January is 1 February, plus the ten days we waited.
    expect(iso(result.dueAt)).toBe('2026-02-11')
    expect(result.pausedMs).toBe(10 * 24 * 60 * 60 * 1000)
  })

  it('counts an open pause up to now', () => {
    const result = computeDeadline({
      jurisdiction: 'uk',
      receivedAt,
      pauses: [{ pausedAt: new Date('2026-01-05T00:00:00.000Z') }],
      now: new Date('2026-01-20T00:00:00.000Z'),
    })
    expect(iso(result.dueAt)).toBe('2026-02-16')
  })

  it('adds up several pauses', () => {
    const result = computeDeadline({
      jurisdiction: 'eu',
      receivedAt,
      pauses: [
        {
          pausedAt: new Date('2026-01-05T00:00:00.000Z'),
          resumedAt: new Date('2026-01-07T00:00:00.000Z'),
        },
        {
          pausedAt: new Date('2026-01-10T00:00:00.000Z'),
          resumedAt: new Date('2026-01-13T00:00:00.000Z'),
        },
      ],
    })
    expect(iso(result.dueAt)).toBe('2026-02-06')
  })

  it('ignores a pause where the jurisdiction does not stop the clock', () => {
    const result = computeDeadline({
      jurisdiction: 'us_ca',
      receivedAt,
      pauses: [
        {
          pausedAt: new Date('2026-01-05T00:00:00.000Z'),
          resumedAt: new Date('2026-01-25T00:00:00.000Z'),
        },
      ],
    })
    // Still 45 days. Pausing must not become an unlimited extension.
    expect(iso(result.dueAt)).toBe('2026-02-15')
    expect(result.pausedMs).toBe(0)
  })

  it('ignores a pause that resumed before it started', () => {
    const result = computeDeadline({
      jurisdiction: 'eu',
      receivedAt,
      pauses: [
        {
          pausedAt: new Date('2026-01-10T00:00:00.000Z'),
          resumedAt: new Date('2026-01-05T00:00:00.000Z'),
        },
      ],
    })
    expect(result.pausedMs).toBe(0)
  })
})

describe('daysRemaining and isOverdue', () => {
  const now = new Date('2026-02-01T00:00:00.000Z')

  it('counts whole days left', () => {
    expect(daysRemaining(new Date('2026-02-11T00:00:00.000Z'), now)).toBe(10)
  })

  it('goes negative once the deadline has passed', () => {
    expect(daysRemaining(new Date('2026-01-30T00:00:00.000Z'), now)).toBe(-2)
  })

  it('reports overdue only after the deadline', () => {
    expect(isOverdue(new Date('2026-02-02T00:00:00.000Z'), now)).toBe(false)
    expect(isOverdue(new Date('2026-01-31T00:00:00.000Z'), now)).toBe(true)
  })
})
