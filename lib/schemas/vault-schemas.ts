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

// --- Schema registry ---
export const VAULT_SCHEMA_TYPES = {
  custom: { label: 'Custom (JSON)', description: 'Free-form JSON data', category: 'personal' },
  medical_basic: { label: 'Medical Record', description: 'Basic medical information', category: 'health' },
  financial_summary: { label: 'Financial Summary', description: 'Bank and income overview', category: 'financial' },
  identity: { label: 'Identity Document', description: 'ID and passport info', category: 'credentials' },
  employment: { label: 'Employment Record', description: 'Work history entry', category: 'credentials' },
  education: { label: 'Education Record', description: 'Academic credentials', category: 'credentials' },
} as const

export type VaultSchemaType = keyof typeof VAULT_SCHEMA_TYPES

export const SCHEMA_VALIDATORS: Record<string, z.ZodSchema> = {
  medical_basic: MedicalBasicSchema,
  financial_summary: FinancialSummarySchema,
  identity: IdentitySchema,
  employment: EmploymentSchema,
  education: EducationSchema,
}
