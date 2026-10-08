/**
 * LD-110 legal acceptance and consumer health data consent.
 *
 * Acceptance of the terms and privacy policy is recorded per version, so a
 * material change asks everyone again. Consent to store health data is a
 * separate, withdrawable record: Washington's My Health My Data Act requires
 * consent before collecting consumer health data, and does not count accepting
 * general terms as that consent.
 */

import { z } from 'zod'
import * as acceptanceRepo from '@/lib/repositories/legal-acceptance.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { disconnectSource, listSources } from '@/lib/services/connector.service'
import { UserFacingError } from '@/lib/actions/action-result'
import {
  HEALTH_CONSENT_REQUIRED,
  HEALTH_DATA_CONSENT_VERSION,
  INDIVIDUAL_DOCUMENTS,
  LEGAL_DOCUMENTS,
  isVersion,
  outstandingDocuments,
  type IndividualDocument,
} from '@/lib/constants/legal'
import type { LegalAcceptance } from '@/types/database.types'

export interface AcceptedVersion {
  version: string
  recordedAt: string
}

export interface LegalStatus {
  accepted: Record<IndividualDocument, AcceptedVersion | null>
  outstanding: IndividualDocument[]
  healthConsent: {
    granted: boolean
    version: string | null
    recordedAt: string | null
  }
}

function latestAccepted(rows: LegalAcceptance[], document: string): AcceptedVersion | null {
  const accepted = rows.filter((row) => row.document === document && row.action === 'accepted')
  if (accepted.length === 0) return null
  // The highest version wins, whatever order the rows were written in.
  const best = accepted.reduce((top, row) => (row.version > top.version ? row : top))
  return { version: best.version, recordedAt: best.recorded_at }
}

export function summarizeAcceptances(rows: LegalAcceptance[]): LegalStatus {
  const accepted = Object.fromEntries(
    INDIVIDUAL_DOCUMENTS.map((document) => [document, latestAccepted(rows, document)])
  ) as Record<IndividualDocument, AcceptedVersion | null>

  // Consent is whatever the most recent health-data record says.
  const health = rows
    .filter((row) => row.document === 'health-data')
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]

  return {
    accepted,
    outstanding: outstandingDocuments(
      Object.fromEntries(
        INDIVIDUAL_DOCUMENTS.map((document) => [document, accepted[document]?.version ?? null])
      )
    ),
    healthConsent: {
      granted: health?.action === 'accepted',
      version: health?.version ?? null,
      recordedAt: health?.recorded_at ?? null,
    },
  }
}

export async function getLegalStatus(userId: string): Promise<LegalStatus> {
  return summarizeAcceptances(await acceptanceRepo.findAcceptancesByUser(userId))
}

function describe(documents: IndividualDocument[]): string {
  return documents
    .map((document) => `${LEGAL_DOCUMENTS[document].title} (${LEGAL_DOCUMENTS[document].version})`)
    .join(' and ')
}

/** Record acceptance of the current versions, from the prompt shown after a change. */
export async function acceptDocuments(userId: string, documents: IndividualDocument[]): Promise<void> {
  const unique = [...new Set(documents)]
  if (unique.length === 0) return
  await acceptanceRepo.insertAcceptances(
    unique.map((document) => ({
      user_id: userId,
      document,
      version: LEGAL_DOCUMENTS[document].version,
      source: 'prompt' as const,
    }))
  )
  await createAuditEntry({
    userId,
    eventType: 'legal_terms_accepted',
    action: `Accepted the ${describe(unique)}`,
    metadata: Object.fromEntries(unique.map((document) => [document, LEGAL_DOCUMENTS[document].version])),
  })
}

/** What the registration form put in sign-up metadata. Anything else is ignored. */
const registrationChoicesSchema = z.object({
  terms: z.string().optional(),
  privacy: z.string().optional(),
  health_data: z.string().optional(),
})

/**
 * Record what the person agreed to on the registration form.
 *
 * The form cannot write to the database, because with email confirmation on
 * there is no session yet. It stores the versions it showed in the sign-up
 * metadata, and this records them on the first signed-in request, timestamped
 * when the account was created. A version later than the one published is
 * ignored, because nobody can have been shown it.
 */
export async function recordRegistrationChoices(
  userId: string,
  metadata: unknown,
  signedUpAt: string
): Promise<IndividualDocument[]> {
  const parsed = registrationChoicesSchema.safeParse(
    (metadata as { legal?: unknown } | null | undefined)?.legal
  )
  if (!parsed.success) return []

  const existing = await acceptanceRepo.findAcceptancesByUser(userId)
  const already = new Set(existing.map((row) => row.document))
  const choices = parsed.data

  const usable = (version: string | undefined, current: string): version is string =>
    isVersion(version) && version <= current

  const documents = INDIVIDUAL_DOCUMENTS.filter(
    (document) => !already.has(document) && usable(choices[document], LEGAL_DOCUMENTS[document].version)
  )
  const health =
    !already.has('health-data') && usable(choices.health_data, HEALTH_DATA_CONSENT_VERSION)

  await acceptanceRepo.insertAcceptances([
    ...documents.map((document) => ({
      user_id: userId,
      document,
      version: choices[document] as string,
      source: 'registration' as const,
      recorded_at: signedUpAt,
    })),
    ...(health
      ? [
          {
            user_id: userId,
            document: 'health-data' as const,
            version: choices.health_data as string,
            source: 'registration' as const,
            recorded_at: signedUpAt,
          },
        ]
      : []),
  ])

  if (documents.length > 0) {
    await createAuditEntry({
      userId,
      eventType: 'legal_terms_accepted',
      action: `Accepted the ${describe(documents)} at sign-up`,
    })
  }
  if (health) {
    await createAuditEntry({
      userId,
      eventType: 'health_data_consent_granted',
      action: 'Consented to LucidData storing health and fitness data, at sign-up',
    })
  }
  return documents
}

export async function hasHealthDataConsent(userId: string): Promise<boolean> {
  return (await getLegalStatus(userId)).healthConsent.granted
}

/** Refuse health data from someone who has not consented to us storing it. */
export async function assertHealthDataConsent(userId: string): Promise<void> {
  if (await hasHealthDataConsent(userId)) return
  throw new UserFacingError(
    'Before LucidData can store health or fitness data, we need your consent. Review it and try again.',
    HEALTH_CONSENT_REQUIRED
  )
}

export async function grantHealthDataConsent(
  userId: string,
  source: 'settings' | 'health-gate'
): Promise<void> {
  await acceptanceRepo.insertAcceptances([
    {
      user_id: userId,
      document: 'health-data',
      version: HEALTH_DATA_CONSENT_VERSION,
      source,
    },
  ])
  await createAuditEntry({
    userId,
    eventType: 'health_data_consent_granted',
    action: 'Consented to LucidData storing health and fitness data',
    metadata: { version: HEALTH_DATA_CONSENT_VERSION },
  })
}

/**
 * Withdraw consent. New health data is refused from here on, and every
 * connected source is disconnected, because each one only exists to bring
 * health data in. Entries already in the vault stay until the person deletes
 * them: deleting is a separate right, and taking it for them would be wrong.
 */
export async function withdrawHealthDataConsent(userId: string): Promise<{ disconnected: number }> {
  await acceptanceRepo.insertAcceptances([
    {
      user_id: userId,
      document: 'health-data',
      version: HEALTH_DATA_CONSENT_VERSION,
      action: 'withdrawn',
      source: 'settings',
    },
  ])
  await createAuditEntry({
    userId,
    eventType: 'health_data_consent_withdrawn',
    action: 'Withdrew consent to LucidData storing health and fitness data',
  })

  let disconnected = 0
  for (const source of await listSources(userId)) {
    await disconnectSource(userId, source.id)
    disconnected += 1
  }
  return { disconnected }
}

/** Accept the organization terms for an organization the person owns. */
export async function acceptOrganizationTerms(userId: string, organizationId: string): Promise<void> {
  await acceptanceRepo.insertAcceptances([
    {
      user_id: userId,
      organization_id: organizationId,
      document: 'organization-terms',
      version: LEGAL_DOCUMENTS['organization-terms'].version,
      source: 'organization-registration',
    },
  ])
  await createAuditEntry({
    userId,
    eventType: 'organization_terms_accepted',
    action: `Accepted the ${LEGAL_DOCUMENTS['organization-terms'].title} for an organization`,
    metadata: { organization_id: organizationId, version: LEGAL_DOCUMENTS['organization-terms'].version },
  })
}
