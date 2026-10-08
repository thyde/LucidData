import { z } from 'zod'

// --- Medical Basic ---
export const MedicalBasicSchema = z.object({
  full_name: z.string().min(1),
  date_of_birth: z.string().min(1),
  blood_type: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']),
  allergies: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  emergency_contact: z.string().optional(),
})
export type MedicalBasic = z.infer<typeof MedicalBasicSchema>

// --- Financial Summary ---
export const FinancialSummarySchema = z.object({
  bank_name: z.string().optional(),
  account_type: z.enum(['checking', 'savings', 'investment', 'other']).optional(),
  income_range: z.enum(['<25k', '25k-50k', '50k-100k', '100k-200k', '>200k']).optional(),
  credit_score_band: z.enum(['poor', 'fair', 'good', 'very_good', 'exceptional']).optional(),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
})
export type FinancialSummary = z.infer<typeof FinancialSummarySchema>

// --- Identity ---
export const IdentitySchema = z.object({
  full_name: z.string().min(1),
  date_of_birth: z.string().min(1),
  nationality: z.string().min(1),
  id_type: z.enum(['passport', 'drivers_license', 'national_id', 'other']),
  id_number_last4: z.string().max(4).optional(),
  issuing_country: z.string().optional(),
  expiry_date: z.string().optional(),
})
export type Identity = z.infer<typeof IdentitySchema>

// --- Employment ---
export const EmploymentSchema = z.object({
  employer: z.string().min(1),
  role: z.string().min(1),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'freelance', 'other']),
  start_date: z.string().min(1),
  end_date: z.string().optional(),
  is_current: z.boolean().default(true),
  salary_range: z.enum(['<30k', '30k-60k', '60k-100k', '100k-150k', '>150k']).optional(),
  currency: z.string().default('USD'),
})
export type Employment = z.infer<typeof EmploymentSchema>

// --- Education ---
export const EducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.enum(['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'other']),
  field_of_study: z.string().min(1),
  graduation_year: z.number().int().min(1900).max(2100).optional(),
  gpa: z.string().optional(),
  honors: z.string().optional(),
})
export type Education = z.infer<typeof EducationSchema>

// --- Fitness Activity (a single workout, e.g. from Strava) ---
export const FitnessActivitySchema = z.object({
  name: z.string().min(1),
  sport_type: z.enum(['Run', 'Ride', 'Walk', 'Hike', 'Swim', 'Workout', 'WeightTraining', 'Yoga', 'Other']),
  start_date: z.string().min(1),
  distance_km: z.number().optional(),
  duration_min: z.number().optional(),
  elevation_gain_m: z.number().optional(),
  average_heartrate: z.number().optional(),
  max_heartrate: z.number().optional(),
  calories: z.number().optional(),
  average_speed_kmh: z.number().optional(),
  source: z.string().optional(),
})
export type FitnessActivity = z.infer<typeof FitnessActivitySchema>

// --- Daily Fitness Summary (a day of activity, e.g. from Fitbit) ---
export const FitnessDailySchema = z.object({
  date: z.string().min(1),
  steps: z.number().optional(),
  distance_km: z.number().optional(),
  calories_out: z.number().optional(),
  floors: z.number().optional(),
  active_minutes: z.number().optional(),
  resting_heart_rate: z.number().optional(),
  sleep_minutes: z.number().optional(),
  source: z.string().optional(),
})
export type FitnessDaily = z.infer<typeof FitnessDailySchema>

// --- Browsing insight (LD-206, an aggregate produced by the extension) ---
// Counts and company names only. There is deliberately no field that could
// hold a site, a path, or a page title, because a shape with nowhere to put
// one cannot leak one.
export const BrowsingInsightSchema = z.object({
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  sites_visited: z.number(),
  collectors_seen: z.number(),
  sensitive_sites_skipped: z.number().optional(),
  top_collector: z.string().optional(),
  top_collector_reach: z.number().optional(),
  advertising_collectors: z.number().optional(),
  analytics_collectors: z.number().optional(),
  fingerprinting_collectors: z.number().optional(),
  source: z.string().optional(),
})
export type BrowsingInsight = z.infer<typeof BrowsingInsightSchema>

// --- LD-209 health shapes ---
// Daily aggregates and sessions, the way the platforms' own statistics APIs
// return them, rather than raw samples, so a year of data stays in the
// thousands of entries. Bounds reject values no body produces, which is how a
// unit mix-up or a malformed import gets caught. Reproductive and menstrual
// data are left out on purpose: an entry's schema type is readable by the
// server, so a dedicated type would itself say what the entry holds.

/** A date and time, as an import supplies it or a datetime-local input produces it. */
const timestamp = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a date and time')

/** A calendar day, such as 2026-10-08. */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date such as 2026-10-08')

const minutesOfDay = z.number().min(0).max(1440)

/** A day record with no measurement in it says nothing, so at least one is required. */
function hasAnyOf(fields: readonly string[]) {
  return (value: Record<string, unknown>) => fields.some((field) => typeof value[field] === 'number')
}

export const SleepSessionSchema = z
  .object({
    start: timestamp,
    end: timestamp,
    asleep_min: minutesOfDay.optional(),
    awake_min: minutesOfDay.optional(),
    light_min: minutesOfDay.optional(),
    deep_min: minutesOfDay.optional(),
    rem_min: minutesOfDay.optional(),
    efficiency_pct: z.number().min(0).max(100).optional(),
    source: z.string().optional(),
  })
  .refine((session) => Date.parse(session.end) > Date.parse(session.start), {
    message: 'The end must be after the start',
    path: ['end'],
  })
  .refine((session) => Date.parse(session.end) - Date.parse(session.start) <= 24 * 60 * 60 * 1000, {
    message: 'A sleep session lasts a day at most',
    path: ['end'],
  })
export type SleepSession = z.infer<typeof SleepSessionSchema>

const VITALS = [
  'resting_heart_rate',
  'heart_rate_variability_ms',
  'blood_oxygen_pct',
  'respiratory_rate',
  'body_temperature_c',
  'blood_pressure_systolic',
  'blood_pressure_diastolic',
] as const

export const VitalsDailySchema = z
  .object({
    date: calendarDay,
    resting_heart_rate: z.number().min(20).max(250).optional(),
    heart_rate_variability_ms: z.number().min(1).max(500).optional(),
    blood_oxygen_pct: z.number().min(50).max(100).optional(),
    respiratory_rate: z.number().min(2).max(80).optional(),
    body_temperature_c: z.number().min(30).max(45).optional(),
    blood_pressure_systolic: z.number().min(50).max(260).optional(),
    blood_pressure_diastolic: z.number().min(20).max(200).optional(),
    source: z.string().optional(),
  })
  .refine(hasAnyOf(VITALS), { message: 'Enter at least one reading' })
  .refine(
    (day) =>
      day.blood_pressure_systolic === undefined ||
      day.blood_pressure_diastolic === undefined ||
      day.blood_pressure_systolic > day.blood_pressure_diastolic,
    { message: 'Systolic pressure is the higher of the two', path: ['blood_pressure_systolic'] }
  )
export type VitalsDaily = z.infer<typeof VitalsDailySchema>

const BODY = ['weight_kg', 'height_cm', 'body_fat_pct', 'lean_mass_kg', 'waist_cm', 'bmi'] as const

export const BodyMeasurementSchema = z
  .object({
    date: calendarDay,
    weight_kg: z.number().min(1).max(700).optional(),
    height_cm: z.number().min(30).max(280).optional(),
    body_fat_pct: z.number().min(1).max(80).optional(),
    lean_mass_kg: z.number().min(1).max(300).optional(),
    waist_cm: z.number().min(10).max(300).optional(),
    bmi: z.number().min(5).max(150).optional(),
    source: z.string().optional(),
  })
  .refine(hasAnyOf(BODY), { message: 'Enter at least one measurement' })
export type BodyMeasurement = z.infer<typeof BodyMeasurementSchema>

const NUTRIENTS = [
  'energy_kcal',
  'protein_g',
  'carbohydrates_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'sodium_mg',
  'water_ml',
] as const

export const NutritionDailySchema = z
  .object({
    date: calendarDay,
    energy_kcal: z.number().min(0).max(20000).optional(),
    protein_g: z.number().min(0).max(2000).optional(),
    carbohydrates_g: z.number().min(0).max(5000).optional(),
    fat_g: z.number().min(0).max(2000).optional(),
    fiber_g: z.number().min(0).max(500).optional(),
    sugar_g: z.number().min(0).max(2000).optional(),
    sodium_mg: z.number().min(0).max(100000).optional(),
    water_ml: z.number().min(0).max(20000).optional(),
    source: z.string().optional(),
  })
  .refine(hasAnyOf(NUTRIENTS), { message: 'Enter at least one amount' })
export type NutritionDaily = z.infer<typeof NutritionDailySchema>

// --- Schema registry ---
// `internal` marks a type the app writes itself: the extension's tracker
// summary, and the copy of a credential saved when one is claimed. Nobody types
// one in or imports one from a file, and no organization issues or requests one.
export const VAULT_SCHEMA_TYPES = {
  custom: { label: 'Custom (JSON)', description: 'Free-form JSON data', category: 'personal' },
  medical_basic: { label: 'Medical record', description: 'Basic medical information', category: 'health' },
  financial_summary: { label: 'Financial summary', description: 'Bank and income overview', category: 'financial' },
  identity: { label: 'Identity document', description: 'ID and passport details', category: 'credentials' },
  employment: { label: 'Employment record', description: 'One job in your work history', category: 'credentials' },
  education: { label: 'Education record', description: 'A qualification you earned', category: 'credentials' },
  fitness_activity: { label: 'Workout', description: 'One workout or activity, such as a run from Strava', category: 'health' },
  fitness_daily: { label: 'Daily activity', description: 'A day of steps, calories, and active minutes', category: 'health' },
  sleep_session: { label: 'Sleep session', description: 'One night or nap, with time in each sleep stage', category: 'health' },
  vitals_daily: { label: 'Daily vitals', description: 'Resting heart rate, blood oxygen, blood pressure, and other readings for one day', category: 'health' },
  body_measurement: { label: 'Body measurement', description: 'Weight, height, body fat, or waist on one day', category: 'health' },
  nutrition_daily: { label: 'Daily nutrition', description: 'Energy, protein, carbohydrates, fat, and water for one day', category: 'health' },
  browsing_insight: { label: 'Tracker summary', description: 'Who collected data as you browsed, counted on your device', category: 'other', internal: true },
  verifiable_credential: { label: 'Issued credential', description: 'An encrypted copy of a credential an organization issued to you', category: 'credentials', internal: true },
} as const

export type VaultSchemaType = keyof typeof VAULT_SCHEMA_TYPES

function isInternal(type: VaultSchemaType): boolean {
  return 'internal' in VAULT_SCHEMA_TYPES[type]
}

/** Types a person can enter by hand or import a file into. */
export const ENTERABLE_SCHEMA_TYPES = (Object.keys(VAULT_SCHEMA_TYPES) as VaultSchemaType[]).filter(
  (type) => !isInternal(type)
)

/** Types an organization can issue or request as a credential: not free-form, not written by the app. */
export const CREDENTIAL_SCHEMA_TYPES = ENTERABLE_SCHEMA_TYPES.filter((type) => type !== 'custom')

export const SCHEMA_VALIDATORS: Record<string, z.ZodSchema> = {
  medical_basic: MedicalBasicSchema,
  financial_summary: FinancialSummarySchema,
  identity: IdentitySchema,
  employment: EmploymentSchema,
  education: EducationSchema,
  fitness_activity: FitnessActivitySchema,
  fitness_daily: FitnessDailySchema,
  sleep_session: SleepSessionSchema,
  vitals_daily: VitalsDailySchema,
  body_measurement: BodyMeasurementSchema,
  nutrition_daily: NutritionDailySchema,
  browsing_insight: BrowsingInsightSchema,
}
