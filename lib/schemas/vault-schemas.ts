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

// --- Schema registry ---
export const VAULT_SCHEMA_TYPES = {
  custom: { label: 'Custom (JSON)', description: 'Free-form JSON data', category: 'personal' },
  medical_basic: { label: 'Medical Record', description: 'Basic medical information', category: 'health' },
  financial_summary: { label: 'Financial Summary', description: 'Bank and income overview', category: 'financial' },
  identity: { label: 'Identity Document', description: 'ID and passport info', category: 'credentials' },
  employment: { label: 'Employment Record', description: 'Work history entry', category: 'credentials' },
  education: { label: 'Education Record', description: 'Academic credentials', category: 'credentials' },
  fitness_activity: { label: 'Fitness Activity', description: 'A workout or activity (e.g. from Strava)', category: 'health' },
  fitness_daily: { label: 'Daily Fitness Summary', description: 'A day of steps, calories, and activity (e.g. from Fitbit)', category: 'health' },
} as const

export type VaultSchemaType = keyof typeof VAULT_SCHEMA_TYPES

export const SCHEMA_VALIDATORS: Record<string, z.ZodSchema> = {
  medical_basic: MedicalBasicSchema,
  financial_summary: FinancialSummarySchema,
  identity: IdentitySchema,
  employment: EmploymentSchema,
  education: EducationSchema,
  fitness_activity: FitnessActivitySchema,
  fitness_daily: FitnessDailySchema,
}
