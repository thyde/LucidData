/**
 * LD-607 deletion manifest.
 *
 * Every table in the public schema has an entry here stating what happens to it
 * when a person erases their account, and why. A Vitest test reads the
 * migrations, derives the live table list, and fails if a table is missing an
 * entry, so a new table cannot ship without a deletion decision.
 *
 * This file is also the disclosure: the trust centre and the deletion receipt
 * both read from it, so what we tell a person matches what the code does.
 */

export type DeletionBehaviour =
  /** Removed automatically by ON DELETE CASCADE from users. */
  | 'cascade'
  /** Removed by an explicit statement, because the key does not cascade. */
  | 'explicit_delete'
  /** Row survives; identifying fields are irreversibly cleared. */
  | 'strip'
  /** Untouched. Holds no personal data about the erasing user. */
  | 'no_personal_data'
  /** Deliberately retained as evidence, in a form that cannot re-identify. */
  | 'retained_evidence'
  /** Held by a third party under its own legal retention, not by us. */
  | 'third_party'

export interface DeletionManifestEntry {
  table: string
  /** Whether the table can hold personal data about the erasing user. */
  personalData: boolean
  behaviour: DeletionBehaviour
  /** The column that ties a row to the user, when there is one. */
  userColumn: string | null
  /**
   * For a child table with no user column of its own: the parent whose
   * deletion takes it with it. Stops the residue sweep from querying a column
   * that does not mean what it looks like it means.
   */
  cascadesVia?: string
  /** For 'strip', the columns cleared. Empty otherwise. */
  strippedColumns: string[]
  /** Why this behaviour is the correct one. */
  reason: string
}

/**
 * Tables the post-deletion verification sweep must find empty for the user.
 * Derived rather than hand-listed so it cannot drift from the manifest.
 */
export function tablesRequiringNoResidue(): DeletionManifestEntry[] {
  return DELETION_MANIFEST.filter(
    (entry) =>
      entry.userColumn !== null &&
      (entry.behaviour === 'cascade' ||
        entry.behaviour === 'explicit_delete' ||
        entry.behaviour === 'strip')
  )
}

export function manifestEntryFor(table: string): DeletionManifestEntry | undefined {
  return DELETION_MANIFEST.find((entry) => entry.table === table)
}

export const DELETION_MANIFEST: DeletionManifestEntry[] = [
  {
    table: 'users',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'id',
    strippedColumns: [],
    reason:
      'Deleting the auth user removes the profile row, which carries the email, display name, key salt, and the wrapped master key.',
  },
  {
    table: 'vault_data',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'The vault itself. Ciphertext is unreadable without the master key, but the rows and their metadata are still deleted.',
  },
  {
    table: 'vault_field_monetization',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Per-field sale settings describe the person and their vault entries.',
  },
  {
    table: 'data_sources',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'A connected provider account, with tokens that would still work. Disconnecting revokes upstream; deletion removes the tokens with the account.',
  },
  {
    table: 'pending_ingest',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'Records a sync sealed to the person and nobody opened yet. Unreadable to us, and deleted rather than kept as unopenable ciphertext.',
  },
  {
    table: 'sale_preferences',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Marketplace preferences are stated by the person.',
  },
  {
    table: 'consents',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'A grant is the person deciding who may read their data.',
  },
  {
    table: 'consent_requests',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'A request names the person and the categories asked for, whether or not they answered.',
  },
  {
    table: 'consent_receipts',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'A receipt states the terms the person agreed to and names the recipient. The recipient keeps their own copy; ours goes.',
  },
  {
    table: 'audit_logs',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'The hash chain is per user, so removing one person leaves every other chain intact and verifiable.',
  },
  {
    table: 'notifications',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Notification bodies quote the person and the parties they dealt with.',
  },
  {
    table: 'passkeys',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'A registered authenticator is an identifier for the person.',
  },
  {
    table: 'mfa_backup_codes',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Backup codes are credentials belonging to the person.',
  },
  {
    table: 'recovery_factors',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Recovery factors describe how the person can regain vault access.',
  },
  {
    table: 'step_up_grants',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Short-lived re-authentication grants belong to the session holder.',
  },
  {
    table: 'revoked_sessions',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'Revocation entries reference the person and their devices.',
  },
  {
    table: 'org_members',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'Membership links the person to an organization. Ownership must be transferred before deletion; see LD-603.',
  },
  {
    table: 'org_invitations',
    personalData: true,
    behaviour: 'explicit_delete',
    userColumn: 'email',
    strippedColumns: [],
    reason:
      'The invitee email is stored as text, so it survives a cascade. Invitations addressed to the person are deleted outright.',
  },
  {
    table: 'credential_requests',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'A request names the person and the credential types asked of them.',
  },
  {
    table: 'rights_cases',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'A rights request states what the person asked for and how it was resolved. Deleting the account resolves any open case by removing it.',
  },
  {
    table: 'rights_case_events',
    personalData: true,
    behaviour: 'cascade',
    userColumn: null,
    cascadesVia: 'rights_cases',
    strippedColumns: [],
    reason:
      'Case evidence cascades with its case. The log is append-only while the case lives, which is what makes it evidence, and a DELETE is permitted only through that cascade.',
  },
  {
    table: 'credential_shares',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'A share token discloses selected claims about the person. Deleting it makes the link fail closed.',
  },
  {
    table: 'issued_credentials',
    personalData: true,
    behaviour: 'explicit_delete',
    userColumn: 'subject_user_id',
    strippedColumns: [],
    reason:
      'The key is ON DELETE SET NULL, which would leave claims and the subject email intact beside a nulled id. Credentials about the person are deleted, so verification fails closed.',
  },
  {
    table: 'pool_contributions',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'A contribution records what the person offered and on what terms.',
  },
  {
    table: 'data_order_records',
    personalData: true,
    behaviour: 'strip',
    userColumn: 'source_user_id',
    strippedColumns: ['payload', 'source_user_id', 'source_contribution_id'],
    reason:
      'A buyer paid for this dataset and data_orders.record_count must stay consistent, so the row survives as a counted placeholder. The payload is emptied and both source links are cleared, which is why a nulled key alone was not enough.',
  },
  {
    table: 'offer_claims',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason: 'A claim records the person accepting a buyer offer.',
  },
  {
    table: 'payouts',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'Any balance is flushed before deletion. The transfer record itself lives with the payment provider under its own retention, so no local financial record is lost.',
  },
  {
    table: 'payout_accounts',
    personalData: true,
    behaviour: 'cascade',
    userColumn: 'user_id',
    strippedColumns: [],
    reason:
      'The link to the connected payment account is removed locally and the connected account is deleted at the provider.',
  },
  {
    table: 'rate_limit_counters',
    personalData: true,
    behaviour: 'explicit_delete',
    userColumn: 'bucket',
    strippedColumns: [],
    reason:
      'Bucket keys embed the subject id, so counters are an identifier even though there is no user_id column.',
  },
  {
    table: 'deletion_receipts',
    personalData: false,
    behaviour: 'retained_evidence',
    userColumn: null,
    strippedColumns: [],
    reason:
      'Proof the erasure happened. Holds a pseudonymous subject id and a hash of the email, never the address, and has no foreign key so it survives the account it describes.',
  },
  {
    table: 'organizations',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason:
      'A business entity with a business contact address. Membership is removed by cascade; the organization is not the person.',
  },
  {
    table: 'organization_api_keys',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'Credentials belong to the organization, not to a member.',
  },
  {
    table: 'org_subscriptions',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'Billing state belongs to the organization.',
  },
  {
    table: 'org_webhooks',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason:
      'An endpoint an organization owns, plus a hashed secret. It names no person.',
  },
  {
    table: 'webhook_deliveries',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason:
      'Delivery attempts carry identifiers and timestamps only. A payload that named a person would be rejected before it was queued.',
  },
  {
    table: 'bulk_jobs',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason:
      'An operation an organization ran, with counts and timings. The person who started it is linked by a key that nulls on deletion, and the job is purged on a retention clock regardless.',
  },
  {
    table: 'bulk_job_rows',
    personalData: true,
    behaviour: 'strip',
    userColumn: null,
    cascadesVia: 'bulk_jobs',
    strippedColumns: ['payload'],
    reason:
      'An uploaded row names a person, who may be the one erasing their account and may have had no say in being uploaded. The payload is cleared when the row succeeds and again on erasure, and the whole job is purged after 30 days. The row itself survives as an outcome record for the organization that ran the job.',
  },
  {
    table: 'issuer_keys',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'Signing keys belong to the organization.',
  },
  {
    table: 'platform_keys',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason:
      'Platform signing keys. Retained so receipts issued before the deletion still verify.',
  },
  {
    table: 'data_pools',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'A buyer-defined request for data. Contains no contributor identity.',
  },
  {
    table: 'data_orders',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'A purchase by an organization. Contributor identity lives on the records.',
  },
  {
    table: 'offers',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'A published buyer offer. Claims carry the identity.',
  },
  {
    table: 'usage_events',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'Per-organization API metering, counted against the organization.',
  },
  {
    table: 'job_runs',
    personalData: false,
    behaviour: 'no_personal_data',
    userColumn: null,
    strippedColumns: [],
    reason: 'Scheduler bookkeeping: job name, timings, and counts.',
  },
]

/**
 * What we cannot delete on the person's behalf, stated plainly so the deletion
 * receipt and the trust centre disclose it rather than implying erasure is
 * total.
 */
export const RESIDUAL_DISCLOSURES = [
  {
    holder: 'Stripe',
    what: 'Records of payouts already sent to you',
    why: 'A payment processor must keep transaction records to meet financial regulation. We delete the connected account; the transaction history is theirs to retain.',
  },
  {
    holder: 'Recipients you granted consent to',
    what: 'Any data they exported while your consent was active',
    why: 'An exported copy is already in their hands. Revoking consent ends future access; it cannot recall a delivered copy.',
  },
  {
    holder: 'LucidData',
    what: 'A signed deletion receipt holding a random account id and a hash of your email',
    why: 'It is the evidence that your deletion happened. It cannot be used to recover your address.',
  },
  {
    holder: 'LucidData',
    what: 'Counted placeholders in datasets a buyer already purchased',
    why: 'The payload is emptied and every link to you is cleared. What remains is a count and a category, which cannot be traced back to you.',
  },
] as const
