/**
 * LD-301 rights request deadlines.
 *
 * A rights request without a clock is a promise with no consequence. This
 * module computes when a case is due, and it is deliberately pure so the rules
 * can be argued with in a test rather than inferred from database state.
 *
 * The rules differ by jurisdiction and they are not interchangeable:
 *   EU and UK  one month from receipt, extendable by two further months for a
 *              complex or numerous request (GDPR Article 12(3)).
 *   California 45 days, extendable by a further 45 (CCPA 1798.130).
 *
 * "One month" means the same date in the next month, not 30 days. A request
 * received on 31 January is due 28 February, or 29 in a leap year. Getting this
 * wrong by a day is the difference between compliant and late.
 */

export const RIGHTS_JURISDICTIONS = ['eu', 'uk', 'us_ca', 'other'] as const
export type RightsJurisdiction = (typeof RIGHTS_JURISDICTIONS)[number]

export interface JurisdictionRule {
  label: string
  /** Base window, expressed the way the law expresses it. */
  base: { months: number } | { days: number }
  /** Permitted extension, or null where none is available. */
  extension: { months: number } | { days: number } | null
  /** Whether the clock stops while we wait for the person to clarify. */
  stopsTheClock: boolean
  citation: string
}

export const JURISDICTION_RULES: Record<RightsJurisdiction, JurisdictionRule> = {
  eu: {
    label: 'European Union',
    base: { months: 1 },
    extension: { months: 2 },
    stopsTheClock: true,
    citation: 'GDPR Article 12(3)',
  },
  uk: {
    label: 'United Kingdom',
    base: { months: 1 },
    extension: { months: 2 },
    stopsTheClock: true,
    citation: 'UK GDPR Article 12(3) and the Data (Use and Access) Act',
  },
  us_ca: {
    label: 'California',
    base: { days: 45 },
    extension: { days: 45 },
    stopsTheClock: false,
    citation: 'CCPA 1798.130(a)(2)',
  },
  other: {
    // No local rule, so hold ourselves to the strictest common window rather
    // than to no window at all.
    label: 'Elsewhere',
    base: { months: 1 },
    extension: { months: 2 },
    stopsTheClock: true,
    citation: 'LucidData policy: the strictest window we apply anywhere',
  },
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Add calendar months, clamping to the last day of the target month. 31 January
 * plus one month is 28 February, not 3 March.
 */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear()
  const month = from.getUTCMonth()
  const day = from.getUTCDate()

  const targetMonthEnd = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, targetMonthEnd)

  return new Date(
    Date.UTC(
      year,
      month + months,
      clampedDay,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  )
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

function applyWindow(from: Date, window: { months: number } | { days: number }): Date {
  return 'months' in window ? addMonths(from, window.months) : addDays(from, window.days)
}

export interface DeadlineInput {
  jurisdiction: RightsJurisdiction
  receivedAt: Date
  /** Set when the case has been extended under the permitted grounds. */
  extended?: boolean
  /**
   * Completed pauses while waiting on the person to clarify or verify. An open
   * pause is passed as a pair with `resumedAt` unset.
   */
  pauses?: { pausedAt: Date; resumedAt?: Date | null }[]
  /** Now, for computing an open pause. Injected so tests are not time-dependent. */
  now?: Date
}

export interface DeadlineResult {
  dueAt: Date
  baseDueAt: Date
  extended: boolean
  /** Milliseconds the clock was stopped, already folded into dueAt. */
  pausedMs: number
  rule: JurisdictionRule
}

/**
 * When a case is due, accounting for extension and any stopped clock.
 *
 * A paused case does not accrue time. Pausing is not a way to buy an unlimited
 * extension, so it only counts where the jurisdiction allows it.
 */
export function computeDeadline(input: DeadlineInput): DeadlineResult {
  const rule = JURISDICTION_RULES[input.jurisdiction]
  const baseDueAt = applyWindow(input.receivedAt, rule.base)

  let dueAt = baseDueAt
  if (input.extended && rule.extension) {
    dueAt = applyWindow(dueAt, rule.extension)
  }

  let pausedMs = 0
  if (rule.stopsTheClock) {
    const now = input.now ?? new Date()
    for (const pause of input.pauses ?? []) {
      const end = pause.resumedAt ?? now
      const elapsed = end.getTime() - pause.pausedAt.getTime()
      if (elapsed > 0) pausedMs += elapsed
    }
    dueAt = new Date(dueAt.getTime() + pausedMs)
  }

  return { dueAt, baseDueAt, extended: Boolean(input.extended && rule.extension), pausedMs, rule }
}

/** Whole days remaining, negative once the deadline has passed. */
export function daysRemaining(dueAt: Date, now: Date = new Date()): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS)
}

export function isOverdue(dueAt: Date, now: Date = new Date()): boolean {
  return dueAt.getTime() < now.getTime()
}

export function isJurisdiction(value: string): value is RightsJurisdiction {
  return (RIGHTS_JURISDICTIONS as readonly string[]).includes(value)
}
