import type { DataCategory } from '@/lib/validations/marketplace'

/**
 * Reference values for personal data by type. These inform the price a buyer is
 * guided to pay and the estimate of what a person's data is worth.
 *
 * Annual values are anchored to primary research on the revealed market value of
 * personal data (Aricent/frog design, reported as US$/year median per person).
 * Per-record and access-fee suggestions follow a two-part tariff: a fixed access
 * fee plus a per-record charge, with higher fees on more sensitive data. Values
 * are stored in cents.
 */

export type Sensitivity = 'high' | 'standard' | 'low'

export interface DataTypePricing {
  category: DataCategory
  label: string
  sensitivity: Sensitivity
  /** Median market value of this data type, per person per year, in cents. */
  annualValueCents: number
  /** Suggested per-record price for a one-time snapshot, in cents. */
  perRecordCents: number
  /** Suggested fixed access fee for a pool of this type, in cents. */
  accessFeeCents: number
}

/** Per-type reference pricing, keyed by marketplace category. */
export const DATA_TYPE_PRICING: Record<DataCategory, DataTypePricing> = {
  financial: {
    category: 'financial',
    label: 'Financial',
    sensitivity: 'high',
    annualValueCents: 15000,
    perRecordCents: 150,
    accessFeeCents: 5000,
  },
  credentials: {
    category: 'credentials',
    label: 'Verified credentials',
    sensitivity: 'high',
    annualValueCents: 12000,
    perRecordCents: 120,
    accessFeeCents: 5000,
  },
  personal: {
    category: 'personal',
    label: 'Identity and contact',
    sensitivity: 'high',
    annualValueCents: 6000,
    perRecordCents: 60,
    accessFeeCents: 2500,
  },
  location: {
    category: 'location',
    label: 'Location history',
    sensitivity: 'high',
    annualValueCents: 5500,
    perRecordCents: 55,
    accessFeeCents: 2500,
  },
  browsing: {
    category: 'browsing',
    label: 'Browsing and search',
    sensitivity: 'standard',
    annualValueCents: 5400,
    perRecordCents: 50,
    accessFeeCents: 1000,
  },
  health: {
    category: 'health',
    label: 'Health',
    sensitivity: 'high',
    annualValueCents: 3800,
    perRecordCents: 40,
    accessFeeCents: 5000,
  },
  interests: {
    category: 'interests',
    label: 'Interests and profile',
    sensitivity: 'low',
    annualValueCents: 500,
    perRecordCents: 10,
    accessFeeCents: 0,
  },
  other: {
    category: 'other',
    label: 'Other',
    sensitivity: 'low',
    annualValueCents: 300,
    perRecordCents: 5,
    accessFeeCents: 0,
  },
}

export interface DataBundle {
  id: string
  label: string
  description: string
  categories: DataCategory[]
}

/**
 * Bundles group related data types so a buyer can request, and a person can sell,
 * a whole profile at once. Sold together they carry a small discount over the sum
 * of the parts.
 */
export const DATA_BUNDLES: DataBundle[] = [
  {
    id: 'identity',
    label: 'Identity and credentials',
    description: 'Verified identity and contact details plus issued credentials.',
    categories: ['personal', 'credentials'],
  },
  {
    id: 'financial',
    label: 'Financial profile',
    description: 'Financial summaries with identity for matching.',
    categories: ['financial', 'personal'],
  },
  {
    id: 'health',
    label: 'Health profile',
    description: 'Health records with identity for matching.',
    categories: ['health', 'personal'],
  },
  {
    id: 'behavioral',
    label: 'Behavioral',
    description: 'Browsing, search, location, and interests.',
    categories: ['browsing', 'location', 'interests'],
  },
  {
    id: 'full',
    label: 'Full profile',
    description: 'Every category a person chooses to share.',
    categories: ['personal', 'financial', 'health', 'credentials', 'location', 'browsing', 'interests'],
  },
]

/** Discount applied when data types are sold together as a bundle. */
export const BUNDLE_DISCOUNT = 0.15

export function suggestedPerRecordCents(category: DataCategory): number {
  return DATA_TYPE_PRICING[category].perRecordCents
}

export function suggestedAccessFeeCents(category: DataCategory): number {
  return DATA_TYPE_PRICING[category].accessFeeCents
}

/** Median monthly value of one data type, per person. */
export function monthlyValueCents(category: DataCategory): number {
  return Math.round(DATA_TYPE_PRICING[category].annualValueCents / 12)
}

/** Per-record price for a bundle, with the bundle discount applied. */
export function bundlePerRecordCents(bundle: DataBundle): number {
  const sum = bundle.categories.reduce((total, c) => total + DATA_TYPE_PRICING[c].perRecordCents, 0)
  return Math.round(sum * (1 - BUNDLE_DISCOUNT))
}

/** Median monthly value of a bundle, per person. */
export function bundleMonthlyValueCents(bundle: DataBundle): number {
  const sum = bundle.categories.reduce((total, c) => total + DATA_TYPE_PRICING[c].annualValueCents, 0)
  return Math.round(sum / 12)
}

/** Estimated monthly value of a person's data given the categories they hold. */
export function estimatedMonthlyValueCents(categories: Iterable<string>): number {
  let total = 0
  const seen = new Set<string>()
  for (const c of categories) {
    if (seen.has(c)) continue
    seen.add(c)
    const pricing = DATA_TYPE_PRICING[c as DataCategory]
    if (pricing) total += Math.round(pricing.annualValueCents / 12)
  }
  return total
}

export const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  high: 'High sensitivity',
  standard: 'Standard',
  low: 'Low sensitivity',
}
