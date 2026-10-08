/**
 * LD-501 privacy classification.
 *
 * Every field a buyer could receive is classified here. A count of contributors
 * is not anonymity: a pool of fifty people still identifies someone if the
 * release carries a postcode, a birth date, and an employer. Classification is
 * what makes the difference between counting people and protecting them.
 *
 * Four classes, following standard k-anonymity terminology:
 *
 *   identifier        Names a person on its own. Dropped, never released.
 *                     Never hashed and released either: a hash is trivially
 *                     re-identifiable against a known population.
 *   quasi_identifier  Harmless alone, identifying in combination. Generalized
 *                     up a ladder until the release reaches k.
 *   sensitive         The thing a buyer is paying for. Released only once the
 *                     record's equivalence class reaches k.
 *   safe              Neither identifying nor sensitive. Released as-is.
 *
 * A field this file does not know about is unclassified. Unclassified fields
 * are treated as sensitive AND suppressed, because a field nobody has looked at
 * could be a direct identifier. That is the only safe default, and it is why
 * custom-schema entries release nothing until someone classifies their fields.
 */

export type PrivacyClass = 'identifier' | 'quasi_identifier' | 'sensitive' | 'safe'

/** How a quasi-identifier is widened when the release cannot reach k. */
export type GeneralizationKind = 'date' | 'year' | 'numeric' | 'categorical'

export interface FieldClassification {
  privacyClass: PrivacyClass
  /** Only meaningful for quasi_identifier. */
  generalization?: GeneralizationKind
  /** Step used by the numeric ladder's first rung. */
  numericStep?: number
  /** Why this classification, in terms a reviewer can argue with. */
  reason: string
}

type SchemaClassification = Record<string, FieldClassification>

const identifier = (reason: string): FieldClassification => ({
  privacyClass: 'identifier',
  reason,
})

const quasi = (
  generalization: GeneralizationKind,
  reason: string,
  numericStep?: number
): FieldClassification => ({
  privacyClass: 'quasi_identifier',
  generalization,
  numericStep,
  reason,
})

const sensitive = (reason: string): FieldClassification => ({
  privacyClass: 'sensitive',
  reason,
})

const safe = (reason: string): FieldClassification => ({
  privacyClass: 'safe',
  reason,
})

/**
 * Per-schema classification. Keys match the field names in
 * lib/schemas/vault-schemas.ts. A test asserts every schema field appears here.
 */
export const FIELD_CLASSIFICATIONS: Record<string, SchemaClassification> = {
  medical_basic: {
    full_name: identifier('A name identifies a person directly.'),
    emergency_contact: identifier('Names or contacts a second identifiable person.'),
    date_of_birth: quasi('date', 'Birth date with two other attributes identifies most people.'),
    blood_type: quasi('categorical', 'Low cardinality, but narrows a cohort when combined.'),
    allergies: sensitive('Health data. Released only once the cohort reaches k.'),
    conditions: sensitive('Health data, and the reason a buyer wants this pool.'),
    medications: sensitive('Health data, and often infers a condition directly.'),
  },
  financial_summary: {
    bank_name: quasi('categorical', 'Narrows a cohort by region and institution.'),
    account_type: safe('Four values, held by most of the population.'),
    income_range: sensitive('Banded already, but financially revealing.'),
    credit_score_band: sensitive('Financially revealing and used in lending decisions.'),
    currency: quasi('categorical', 'A proxy for country of residence.'),
    notes: identifier('Free text. Cannot be checked for names, so it never leaves.'),
  },
  identity: {
    full_name: identifier('A name identifies a person directly.'),
    id_number_last4: identifier('A document fragment. Re-identifiable against a known list.'),
    date_of_birth: quasi('date', 'Birth date with two other attributes identifies most people.'),
    nationality: quasi('categorical', 'Strongly narrows a cohort in most populations.'),
    issuing_country: quasi('categorical', 'Correlates with nationality and residence.'),
    expiry_date: quasi('date', 'Near-unique in combination with issuing country.'),
    id_type: safe('Four values, and every holder has one.'),
  },
  employment: {
    employer: quasi('categorical', 'A small employer plus a role identifies one person.'),
    role: quasi('categorical', 'Job titles are near-unique inside a small employer.'),
    start_date: quasi('date', 'A start date narrows a cohort inside an employer.'),
    end_date: quasi('date', 'Same as start date.'),
    employment_type: safe('Five values, widely held.'),
    is_current: safe('Boolean, widely held.'),
    salary_range: sensitive('Banded already, but financially revealing.'),
    currency: quasi('categorical', 'A proxy for country of employment.'),
  },
  education: {
    institution: quasi('categorical', 'A small institution plus a year identifies one person.'),
    graduation_year: quasi('year', 'A year narrows a cohort inside an institution.'),
    field_of_study: quasi('categorical', 'Near-unique in a small cohort.'),
    degree: safe('Seven values, widely held.'),
    gpa: sensitive('An academic outcome, and near-unique at full precision.'),
    honors: identifier('Free text. Often names the person or an award citation.'),
  },
  fitness_activity: {
    name: identifier('Free text. Activity names routinely contain places and people.'),
    start_date: quasi('date', 'A timestamp plus a route identifies a person quickly.'),
    sport_type: safe('Nine values, widely held.'),
    source: safe('The device or app that produced the record.'),
    distance_km: sensitive('Behavioural, and the reason a buyer wants this pool.'),
    duration_min: sensitive('Behavioural, and a proxy for daily routine.'),
    elevation_gain_m: sensitive('Behavioural, and a strong proxy for location.'),
    average_heartrate: sensitive('Health data measured during exertion.'),
    max_heartrate: sensitive('Health data, and a cardiac risk indicator.'),
    calories: sensitive('Health data, and a proxy for body mass.'),
    average_speed_kmh: sensitive('Behavioural, and a proxy for fitness level.'),
  },
  fitness_daily: {
    date: quasi('date', 'A day plus a step count is close to unique over time.'),
    source: safe('The device or app that produced the record.'),
    steps: sensitive('Behavioural, and the reason a buyer wants this pool.'),
    distance_km: sensitive('Behavioural, and a proxy for daily routine.'),
    calories_out: sensitive('Health data, and a proxy for body mass.'),
    floors: sensitive('Behavioural, and a proxy for where someone lives or works.'),
    active_minutes: sensitive('Behavioural, and a proxy for daily routine.'),
    resting_heart_rate: sensitive('Health data, and a cardiac risk indicator.'),
    sleep_minutes: sensitive('Health data, and a proxy for daily routine.'),
  },
  browsing_insight: {
    period_start: quasi('date', 'A start date narrows which weeks of activity this covers.'),
    period_end: quasi('date', 'An end date narrows which weeks of activity this covers.'),
    source: safe('The tool that produced the record.'),
    top_collector: quasi(
      'categorical',
      'A single company name, drawn from a short list. Common on its own, distinguishing in combination.'
    ),
    sites_visited: sensitive('Browsing volume, and a proxy for how someone spends their time.'),
    collectors_seen: sensitive('Browsing volume by another name.'),
    sensitive_sites_skipped: sensitive(
      'A count of visits to health, finance, legal, adult, or support sites. The count alone is disclosive, which is why it is never sold and only shown to the person.'
    ),
    top_collector_reach: sensitive('A behavioural measure of where someone browses.'),
    advertising_collectors: sensitive('Behavioural, and a proxy for the kind of sites visited.'),
    analytics_collectors: sensitive('Behavioural, and a proxy for the kind of sites visited.'),
    fingerprinting_collectors: sensitive(
      'Behavioural, and a proxy for visiting sites that resist automation, such as banking.'
    ),
  },
}

export interface ClassificationResult {
  field: string
  classification: FieldClassification | null
}

/**
 * Classify one field. Returns null when the schema or the field is unknown,
 * which the release path treats as suppress rather than release.
 */
export function classifyField(
  schemaType: string,
  field: string
): FieldClassification | null {
  return FIELD_CLASSIFICATIONS[schemaType]?.[field] ?? null
}

/** True when a field may appear in a release at all. */
export function isReleasable(schemaType: string, field: string): boolean {
  const classification = classifyField(schemaType, field)
  if (!classification) return false
  return classification.privacyClass !== 'identifier'
}

export function fieldsByClass(schemaType: string, privacyClass: PrivacyClass): string[] {
  const schema = FIELD_CLASSIFICATIONS[schemaType]
  if (!schema) return []
  return Object.entries(schema)
    .filter(([, classification]) => classification.privacyClass === privacyClass)
    .map(([field]) => field)
    .sort()
}

/** Every schema this module can release. Anything else releases nothing. */
export function classifiedSchemaTypes(): string[] {
  return Object.keys(FIELD_CLASSIFICATIONS).sort()
}
