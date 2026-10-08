/**
 * LD-110 legal documents.
 *
 * Every published document has a version, which is the date its current text
 * took effect. A person's acceptance is recorded against that version in
 * `legal_acceptances`, so a later change can ask them again and the record
 * shows exactly what they agreed to.
 *
 * Changing a version is a material change: everyone who accepted the old one is
 * asked again before they can carry on. Fixing a typo is not, and should not
 * move the version.
 */

import { VAULT_SCHEMA_TYPES } from '@luciddata/core/schemas/vault-schemas'

export type LegalDocumentId = 'terms' | 'privacy' | 'health-privacy' | 'organization-terms'

export interface LegalDocument {
  id: LegalDocumentId
  title: string
  path: string
  /** The date the current text took effect, YYYY-MM-DD. */
  version: string
  summary: string
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    path: '/legal/terms',
    version: '2026-10-08',
    summary: 'The agreement between you and LucidData when you use an individual account.',
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    path: '/legal/privacy',
    version: '2026-10-08',
    summary: 'What we collect, why, who we share it with, and the choices you have.',
  },
  'health-privacy': {
    id: 'health-privacy',
    title: 'Consumer Health Data Privacy Policy',
    path: '/legal/health-privacy',
    version: '2026-10-08',
    summary:
      'How we handle health and fitness data, written for the Washington, Nevada, and Connecticut consumer health data laws.',
  },
  'organization-terms': {
    id: 'organization-terms',
    title: 'Organization Terms and Data Processing Agreement',
    path: '/legal/organization-terms',
    version: '2026-10-08',
    summary: 'The agreement for organizations that issue, verify, or buy through LucidData.',
  },
}

export const ACCOUNT_DELETION_PATH = '/legal/account-deletion'

/**
 * Pages reachable without accepting a changed version, because the terms
 * promise that someone who rejects a change can still export their data,
 * delete their account, and exercise their privacy rights.
 */
export const LEGAL_GATE_EXEMPT_PATHS = ['/settings', '/privacy'] as const

/** What an individual account must accept, at sign-up and after each change. */
export const INDIVIDUAL_DOCUMENTS = ['terms', 'privacy'] as const satisfies readonly LegalDocumentId[]
export type IndividualDocument = (typeof INDIVIDUAL_DOCUMENTS)[number]

/**
 * Consent to store consumer health data is recorded as its own document,
 * versioned with the health privacy policy it refers to. It is never bundled
 * with the terms, because Washington's My Health My Data Act does not count
 * acceptance of general terms as consent.
 */
export const HEALTH_DATA_CONSENT_VERSION = LEGAL_DOCUMENTS['health-privacy'].version

/** The `document` values the acceptance table accepts. */
export type AcceptanceDocument = IndividualDocument | 'organization-terms' | 'health-data'

export const PRIVACY_CONTACT = 'privacy@luciddatabank.com'
export const LEGAL_CONTACT = 'legal@luciddatabank.com'

/**
 * Counsel has not reviewed these documents yet. The roadmap records it as an
 * open LD-110 criterion, and this stays null until a review is done.
 */
export const COUNSEL_REVIEWED_ON: string | null = null

/** Versions are dates, so they compare as strings. */
export function isCurrent(accepted: string | null | undefined, current: string): boolean {
  return typeof accepted === 'string' && accepted >= current
}

/** The documents a person still has to accept, given the latest version of each they have. */
export function outstandingDocuments(
  accepted: Partial<Record<IndividualDocument, string | null>>
): IndividualDocument[] {
  return INDIVIDUAL_DOCUMENTS.filter(
    (document) => !isCurrent(accepted[document], LEGAL_DOCUMENTS[document].version)
  )
}

const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_PATTERN.test(value)
}

/** Schema types that hold health or fitness data, read from the schema registry. */
export const HEALTH_SCHEMA_TYPES: readonly string[] = Object.entries(VAULT_SCHEMA_TYPES)
  .filter(([, meta]) => meta.category === 'health')
  .map(([type]) => type)

/**
 * Whether an entry is consumer health data and so needs the separate consent.
 * Either signal is enough: a custom entry filed under health counts, and so
 * does a fitness record whatever category it was given.
 */
export function isHealthEntry(entry: { category?: string | null; schema_type?: string | null }): boolean {
  return (
    entry.category === 'health' ||
    (typeof entry.schema_type === 'string' && HEALTH_SCHEMA_TYPES.includes(entry.schema_type))
  )
}

/** The failure code a service raises when health data arrives without consent. */
export const HEALTH_CONSENT_REQUIRED = 'health_consent_required'
