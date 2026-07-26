/**
 * LD-503 buyer evaluation surface.
 *
 * Buyers commit to a purchase with almost no visibility, which suppresses
 * conversion. LD-501 made that worse rather than better: full-domain
 * generalization rarely refuses once a pool has k records, it generalizes hard
 * instead. A cohort of five people at five different employers is delivered
 * with the employer suppressed and the start date widened to a decade. That is
 * correct, and the privacy report says so, but only after the charge.
 *
 * So this surface reports the privacy outcome *before* purchase, and it does it
 * by calling the same `prepareRelease` the purchase path calls. A second
 * estimator would eventually disagree with the gate, and the buyer would be the
 * one who found out.
 *
 * Nothing here returns a contributed value. Coverage, freshness, and schema mix
 * come from Postgres functions that aggregate without exposing values, and
 * samples are invented from the schema.
 */

import { createServiceClient } from '@/lib/supabase/service'
import * as poolRepo from '@/lib/repositories/pool.repository'
import * as contributionRepo from '@/lib/repositories/contribution.repository'
import {
  PrivacyGateError,
  prepareRelease,
  type FieldGeneralization,
} from '@/lib/privacy/k-anonymity'
import {
  buildSyntheticSamples,
  describeDeliverableFields,
  SYNTHETIC_NOTICE,
  type DeliverableField,
  type SyntheticSample,
} from '@/lib/services/synthetic-samples'
import { computeOrderTotal } from '@/lib/constants/marketplace-economics'

export interface FieldCoverage {
  field: string
  present: number
  /** Share of live contributions carrying the field, 0 to 1. */
  coverage: number
}

export interface FreshnessBucket {
  bucket: string
  label: string
  records: number
}

const FRESHNESS_LABELS: Record<string, string> = {
  under_7_days: 'Last 7 days',
  under_30_days: '7 to 30 days',
  under_90_days: '30 to 90 days',
  under_1_year: '90 days to a year',
  over_1_year: 'Over a year',
}

const FRESHNESS_ORDER = [
  'under_7_days',
  'under_30_days',
  'under_90_days',
  'under_1_year',
  'over_1_year',
]

/**
 * Contributor counts are reported as a band. An exact count is a moving number
 * a buyer could watch to infer when one specific person joined or left.
 */
export function contributorBand(count: number): string {
  if (count === 0) return 'None yet'
  if (count < 10) return 'Under 10'
  if (count < 50) return '10 to 49'
  if (count < 100) return '50 to 99'
  if (count < 500) return '100 to 499'
  if (count < 1000) return '500 to 999'
  return '1,000 or more'
}

export type PrivacyPreview =
  | {
      releasable: true
      /** Cohort size actually achieved, at or above the pool target. */
      k: number
      kTarget: number
      recordsOffered: number
      recordsSuppressed: number
      suppressionRate: number
      generalizations: FieldGeneralization[]
      identifiersDropped: string[]
      unclassifiedSuppressed: string[]
    }
  | {
      releasable: false
      kTarget: number
      /** Plain-language reason. Never names the cohort or its size. */
      reason: string
    }

export interface PoolEvaluation {
  pool: {
    id: string
    name: string
    description: string | null
    category: string
    purpose: string
    retentionDays: number
    minimumContributors: number
    kAnonymityTarget: number
  }
  contributorBand: string
  recordCount: number
  coverage: FieldCoverage[]
  freshness: FreshnessBucket[]
  schemaMix: { schemaType: string; records: number }[]
  deliverableFields: Record<string, DeliverableField[]>
  samples: Record<string, SyntheticSample[]>
  syntheticNotice: string
  privacy: PrivacyPreview
  estimatedTotalCents: number
}

const REFUSAL_REASONS: Record<string, string> = {
  empty_release: 'This pool has no contributions yet.',
  fewer_records_than_k:
    'This pool does not yet hold enough contributions to release anything without identifying individuals.',
  no_class_reaches_k:
    'The contributions are too varied to group into cohorts of the required size.',
  suppression_exceeds_limit:
    'Too much of this pool would have to be withheld to protect contributors.',
  no_releasable_fields:
    'Protecting contributors would require withholding every field, leaving nothing to deliver.',
}

/**
 * Everything a buyer needs to decide, computed from the same code that will run
 * at purchase. If this says a release is refused, the purchase will refuse too.
 */
export async function evaluatePool(poolId: string, orgId: string): Promise<PoolEvaluation> {
  const pool = await poolRepo.findPoolByOrg(poolId, orgId)
  if (!pool) throw new Error('Pool not found for this organization')

  const service = createServiceClient()
  const [coverageResult, freshnessResult, schemaMixResult] = await Promise.all([
    service.rpc('pool_field_coverage', { p_pool_id: poolId }),
    service.rpc('pool_freshness', { p_pool_id: poolId }),
    service.rpc('pool_schema_mix', { p_pool_id: poolId }),
  ])
  if (coverageResult.error) throw coverageResult.error
  if (freshnessResult.error) throw freshnessResult.error
  if (schemaMixResult.error) throw schemaMixResult.error

  const contributions = await contributionRepo.findActiveContributionsByPool(poolId)
  const recordCount = contributions.length
  const contributors = new Set(contributions.map((entry) => entry.user_id)).size

  const coverage: FieldCoverage[] = (
    (coverageResult.data ?? []) as { field: string; present: number }[]
  ).map((row) => ({
    field: row.field,
    present: Number(row.present),
    coverage: recordCount === 0 ? 0 : Number((Number(row.present) / recordCount).toFixed(3)),
  }))

  const freshnessRows = (freshnessResult.data ?? []) as { bucket: string; records: number }[]
  const freshness: FreshnessBucket[] = FRESHNESS_ORDER.filter((bucket) =>
    freshnessRows.some((row) => row.bucket === bucket)
  ).map((bucket) => ({
    bucket,
    label: FRESHNESS_LABELS[bucket],
    records: Number(freshnessRows.find((row) => row.bucket === bucket)?.records ?? 0),
  }))

  const schemaMix = ((schemaMixResult.data ?? []) as { schema_type: string; records: number }[])
    .map((row) => ({ schemaType: row.schema_type, records: Number(row.records) }))

  const privacy = previewRelease(pool.k_anonymity_target, contributions)

  const generalizationLevels = Object.fromEntries(
    privacy.releasable
      ? privacy.generalizations.map((entry) => [entry.field, entry.level])
      : []
  )

  const deliverableFields: Record<string, DeliverableField[]> = {}
  const samples: Record<string, SyntheticSample[]> = {}
  for (const entry of schemaMix) {
    if (entry.schemaType === 'unclassified') continue
    deliverableFields[entry.schemaType] = describeDeliverableFields(entry.schemaType)
    samples[entry.schemaType] = buildSyntheticSamples(entry.schemaType, {
      count: 3,
      generalizationLevels,
    })
  }

  const offered = privacy.releasable ? privacy.recordsOffered : 0

  return {
    pool: {
      id: pool.id,
      name: pool.name,
      description: pool.description,
      category: pool.category,
      purpose: pool.purpose,
      retentionDays: pool.retention_days,
      minimumContributors: pool.minimum_contributors,
      kAnonymityTarget: pool.k_anonymity_target,
    },
    contributorBand: contributorBand(contributors),
    recordCount,
    coverage,
    freshness,
    schemaMix,
    deliverableFields,
    samples,
    syntheticNotice: SYNTHETIC_NOTICE,
    privacy,
    // Priced on what would actually be delivered, not on what was contributed.
    estimatedTotalCents: computeOrderTotal(
      pool.price_per_record_cents,
      pool.price_cents,
      offered
    ),
  }
}

/**
 * Run the real gate and report only its summary. Contributions go in, a report
 * comes out, and no contributed value is returned to the caller.
 */
function previewRelease(
  kTarget: number,
  contributions: Awaited<ReturnType<typeof contributionRepo.findActiveContributionsByPool>>
): PrivacyPreview {
  const candidates = contributions.filter(
    (contribution) =>
      contribution.schema_type !== null &&
      contribution.anonymized_payload !== null &&
      typeof contribution.anonymized_payload === 'object' &&
      !Array.isArray(contribution.anonymized_payload)
  )

  try {
    const result = prepareRelease(
      candidates.map((contribution) => ({
        id: contribution.id,
        schemaType: contribution.schema_type as string,
        payload: contribution.anonymized_payload as Record<string, unknown>,
      })),
      { k: kTarget }
    )
    return {
      releasable: true,
      k: result.report.k,
      kTarget: result.report.kTarget,
      recordsOffered: result.report.recordsReleased,
      recordsSuppressed: result.report.recordsSuppressed,
      suppressionRate: result.report.suppressionRate,
      generalizations: result.report.generalizations,
      identifiersDropped: result.report.identifiersDropped,
      unclassifiedSuppressed: result.report.unclassifiedSuppressed,
    }
  } catch (error) {
    if (error instanceof PrivacyGateError) {
      return {
        releasable: false,
        kTarget,
        reason: REFUSAL_REASONS[error.reason] ?? REFUSAL_REASONS.no_class_reaches_k,
      }
    }
    throw error
  }
}
