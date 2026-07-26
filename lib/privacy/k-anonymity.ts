/**
 * LD-501 k-anonymity enforcement.
 *
 * A release is k-anonymous when every record shares its quasi-identifier values
 * with at least k-1 others. Anything less means a buyer can single someone out
 * by combining fields that each look harmless on their own.
 *
 * The approach is full-domain generalization: every record uses the same rung
 * of the same ladder for a given field, so the result is deterministic and can
 * be reproduced from the levels recorded on the order. Records that still sit
 * in a class below k are suppressed. If the ladder runs out and too much of the
 * dataset would have to be suppressed, the release is refused rather than
 * shipped with a warning.
 */

import {
  classifyField,
  type GeneralizationKind,
  type PrivacyClass,
} from '@/lib/privacy/quasi-identifiers'

/** Below this, a "cohort" is a handful of people. */
export const MIN_K = 2

/** Default k for a release when a pool does not set its own. */
export const DEFAULT_K = 5

/**
 * The most of a dataset we will throw away to reach k. Past this the release is
 * no longer representative of what the buyer was shown, so refusing is more
 * honest than delivering a skewed remnant.
 */
export const MAX_SUPPRESSION_RATE = 0.5

export type GeneralizedValue = string | number | null

export interface LadderRung {
  level: number
  label: string
}

/** How far each kind of field can be widened before it is dropped entirely. */
export const LADDERS: Record<GeneralizationKind, LadderRung[]> = {
  date: [
    { level: 0, label: 'exact day' },
    { level: 1, label: 'month' },
    { level: 2, label: 'quarter' },
    { level: 3, label: 'year' },
    { level: 4, label: 'decade' },
    { level: 5, label: 'suppressed' },
  ],
  year: [
    { level: 0, label: 'exact year' },
    { level: 1, label: '5-year band' },
    { level: 2, label: '10-year band' },
    { level: 3, label: '25-year band' },
    { level: 4, label: 'suppressed' },
  ],
  numeric: [
    { level: 0, label: 'exact value' },
    { level: 1, label: 'rounded to step' },
    { level: 2, label: 'rounded to 10 steps' },
    { level: 3, label: 'rounded to 100 steps' },
    { level: 4, label: 'suppressed' },
  ],
  categorical: [
    { level: 0, label: 'exact value' },
    // A category has no natural hierarchy, so the only widening available is to
    // stop reporting it. Inventing a hierarchy here would be a guess that
    // silently changes what the buyer is told about the data.
    { level: 1, label: 'suppressed' },
  ],
}

export function maxLevel(kind: GeneralizationKind): number {
  return LADDERS[kind][LADDERS[kind].length - 1].level
}

export function rungLabel(kind: GeneralizationKind, level: number): string {
  const clamped = Math.min(Math.max(level, 0), maxLevel(kind))
  return LADDERS[kind][clamped].label
}

function generalizeDate(value: unknown, level: number): GeneralizedValue {
  if (level >= 5) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  if (level === 0) return date.toISOString().slice(0, 10)
  if (level === 1) return date.toISOString().slice(0, 7)
  if (level === 2) return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
  if (level === 3) return String(year)
  return `${Math.floor(year / 10) * 10}s`
}

function generalizeYear(value: unknown, level: number): GeneralizedValue {
  if (level >= 4) return null
  const year = Number(value)
  if (!Number.isFinite(year)) return null
  if (level === 0) return year
  const width = level === 1 ? 5 : level === 2 ? 10 : 25
  const start = Math.floor(year / width) * width
  return `${start}-${start + width - 1}`
}

function generalizeNumeric(value: unknown, level: number, step: number): GeneralizedValue {
  if (level >= 4) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (level === 0) return numeric
  const width = step * 10 ** (level - 1)
  const start = Math.floor(numeric / width) * width
  return `${start}-${start + width}`
}

function generalizeCategorical(value: unknown, level: number): GeneralizedValue {
  if (level >= 1) return null
  if (value === null || value === undefined) return null
  return String(value)
}

/**
 * Widen one value to the given rung. Pure and total: an unparseable value
 * generalizes to null, which groups with every other missing value rather than
 * throwing partway through a release.
 */
export function generalizeValue(
  kind: GeneralizationKind,
  value: unknown,
  level: number,
  numericStep = 1
): GeneralizedValue {
  switch (kind) {
    case 'date':
      return generalizeDate(value, level)
    case 'year':
      return generalizeYear(value, level)
    case 'numeric':
      return generalizeNumeric(value, level, numericStep)
    case 'categorical':
      return generalizeCategorical(value, level)
  }
}

export interface ReleaseRecord {
  id: string
  schemaType: string
  payload: Record<string, unknown>
}

export interface EquivalenceClass {
  key: string
  size: number
  recordIds: string[]
}

/**
 * Group records by their generalized quasi-identifier values. This is the whole
 * measurement: k is the size of the smallest class.
 */
export function equivalenceClasses(
  records: ReleaseRecord[],
  quasiFields: string[],
  levels: Record<string, number>
): EquivalenceClass[] {
  const groups = new Map<string, string[]>()

  for (const record of records) {
    const parts: string[] = []
    for (const field of quasiFields) {
      const classification = classifyField(record.schemaType, field)
      const kind = classification?.generalization ?? 'categorical'
      const value = generalizeValue(
        kind,
        record.payload[field],
        levels[field] ?? 0,
        classification?.numericStep ?? 1
      )
      parts.push(`${field}=${value === null ? '*' : String(value)}`)
    }
    const key = parts.join('|')
    const existing = groups.get(key)
    if (existing) existing.push(record.id)
    else groups.set(key, [record.id])
  }

  return [...groups.entries()]
    .map(([key, recordIds]) => ({ key, size: recordIds.length, recordIds }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** The k actually achieved: the size of the smallest equivalence class. */
export function achievedK(classes: EquivalenceClass[]): number {
  if (classes.length === 0) return 0
  return classes.reduce((min, group) => Math.min(min, group.size), Infinity)
}

export class PrivacyGateError extends Error {
  readonly reason: string

  constructor(reason: string) {
    // Deliberately vague to the buyer: a precise refusal ("only 3 people match")
    // is itself a disclosure about the cohort.
    super(
      'This dataset cannot be released without identifying individual contributors. Broaden the pool or reduce the fields requested.'
    )
    this.name = 'PrivacyGateError'
    this.reason = reason
  }
}

export interface FieldGeneralization {
  field: string
  kind: GeneralizationKind
  level: number
  label: string
}

export interface PrivacyReport {
  /** Bumped when the meaning of any report field changes. */
  version: string
  k: number
  kTarget: number
  recordsIn: number
  recordsReleased: number
  recordsSuppressed: number
  suppressionRate: number
  identifiersDropped: string[]
  unclassifiedSuppressed: string[]
  generalizations: FieldGeneralization[]
  epsilonSpent: number
}

export const PRIVACY_REPORT_VERSION = '1.0'

export interface ReleaseResult {
  records: { id: string; payload: Record<string, unknown> }[]
  report: PrivacyReport
  classes: EquivalenceClass[]
}

interface FieldPlan {
  field: string
  kind: GeneralizationKind
  numericStep: number
}

function planFields(records: ReleaseRecord[]): {
  quasi: FieldPlan[]
  release: Map<string, PrivacyClass>
  identifiers: Set<string>
  unclassified: Set<string>
} {
  const quasi = new Map<string, FieldPlan>()
  const release = new Map<string, PrivacyClass>()
  const identifiers = new Set<string>()
  const unclassified = new Set<string>()

  for (const record of records) {
    for (const field of Object.keys(record.payload)) {
      const classification = classifyField(record.schemaType, field)
      if (!classification) {
        // A field nobody has classified could be a direct identifier.
        unclassified.add(field)
        continue
      }
      if (classification.privacyClass === 'identifier') {
        identifiers.add(field)
        continue
      }
      release.set(field, classification.privacyClass)
      if (classification.privacyClass === 'quasi_identifier') {
        quasi.set(field, {
          field,
          kind: classification.generalization ?? 'categorical',
          numericStep: classification.numericStep ?? 1,
        })
      }
    }
  }

  return {
    quasi: [...quasi.values()].sort((a, b) => a.field.localeCompare(b.field)),
    release,
    identifiers,
    unclassified,
  }
}

/**
 * Build a release that meets k, or refuse.
 *
 * Deterministic: the same records and the same k always produce the same
 * generalization levels, the same suppressions, and the same output, so the
 * report on the order is enough to reproduce it.
 */
export function prepareRelease(
  records: ReleaseRecord[],
  options: { k?: number; epsilonSpent?: number } = {}
): ReleaseResult {
  const kTarget = Math.max(options.k ?? DEFAULT_K, MIN_K)
  const { quasi, release, identifiers, unclassified } = planFields(records)

  if (records.length === 0) {
    throw new PrivacyGateError('empty_release')
  }
  if (records.length < kTarget) {
    throw new PrivacyGateError('fewer_records_than_k')
  }

  const levels: Record<string, number> = {}
  for (const plan of quasi) levels[plan.field] = 0

  // Widen one field at a time, in a fixed order, taking the field that is
  // furthest from its ceiling first. Fixed order is what makes this
  // reproducible.
  const quasiFields = quasi.map((plan) => plan.field)
  let classes = equivalenceClasses(records, quasiFields, levels)
  let suppressed = classes
    .filter((group) => group.size < kTarget)
    .reduce((total, group) => total + group.size, 0)

  while (suppressed / records.length > MAX_SUPPRESSION_RATE) {
    const widenable = quasi.filter((plan) => levels[plan.field] < maxLevel(plan.kind))
    if (widenable.length === 0) break
    const next = widenable.reduce((best, plan) =>
      maxLevel(plan.kind) - levels[plan.field] > maxLevel(best.kind) - levels[best.field]
        ? plan
        : best
    )
    levels[next.field] += 1
    classes = equivalenceClasses(records, quasiFields, levels)
    suppressed = classes
      .filter((group) => group.size < kTarget)
      .reduce((total, group) => total + group.size, 0)
  }

  const suppressionRate = suppressed / records.length
  if (suppressionRate > MAX_SUPPRESSION_RATE) {
    throw new PrivacyGateError('suppression_exceeds_limit')
  }

  const keptIds = new Set(
    classes.filter((group) => group.size >= kTarget).flatMap((group) => group.recordIds)
  )
  if (keptIds.size === 0) {
    throw new PrivacyGateError('no_class_reaches_k')
  }

  const released = records
    .filter((record) => keptIds.has(record.id))
    .map((record) => {
      const payload: Record<string, unknown> = {}
      for (const [field, privacyClass] of release) {
        if (!(field in record.payload)) continue
        if (privacyClass === 'quasi_identifier') {
          const plan = quasi.find((candidate) => candidate.field === field)
          if (!plan) continue
          const value = generalizeValue(
            plan.kind,
            record.payload[field],
            levels[field],
            plan.numericStep
          )
          if (value !== null) payload[field] = value
        } else {
          payload[field] = record.payload[field]
        }
      }
      return { id: record.id, payload }
    })

  const keptClasses = classes.filter((group) => group.size >= kTarget)

  // Widening every quasi-identifier to suppression does technically reach k, but
  // if nothing survives it there is no dataset left. Shipping empty records
  // would let a buyer pay for a file that says nothing.
  if (released.every((record) => Object.keys(record.payload).length === 0)) {
    throw new PrivacyGateError('no_releasable_fields')
  }

  return {
    records: released,
    classes: keptClasses,
    report: {
      version: PRIVACY_REPORT_VERSION,
      k: achievedK(keptClasses),
      kTarget,
      recordsIn: records.length,
      recordsReleased: released.length,
      recordsSuppressed: records.length - released.length,
      suppressionRate: Number(
        ((records.length - released.length) / records.length).toFixed(4)
      ),
      identifiersDropped: [...identifiers].sort(),
      unclassifiedSuppressed: [...unclassified].sort(),
      generalizations: quasi.map((plan) => ({
        field: plan.field,
        kind: plan.kind,
        level: levels[plan.field],
        label: rungLabel(plan.kind, levels[plan.field]),
      })),
      epsilonSpent: options.epsilonSpent ?? 0,
    },
  }
}
