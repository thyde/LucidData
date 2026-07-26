/**
 * LD-101 trust disclosures.
 *
 * This is the single source for what the public trust centre states. It must
 * describe what is true today, not what is planned. If the code changes, this
 * file changes in the same pull request.
 *
 * A Vitest test asserts every module in lib/crypto/ has an entry here, so a new
 * piece of key handling cannot ship undisclosed.
 */

export type KeyHolder = 'user_browser' | 'server' | 'nobody'

export interface KeyCustodyEntry {
  /** The key material or crypto responsibility being described. */
  material: string
  /** The module in lib/crypto/ that implements it. */
  module: string
  /** Where it is produced. */
  derivedOrGenerated: string
  /** Who can use it. */
  heldBy: KeyHolder
  /** What it protects, in plain terms. */
  protects: string
  /** The consequence a reader most needs to understand. */
  note: string
}

export const KEY_HOLDER_LABEL: Record<KeyHolder, string> = {
  user_browser: 'You, in your browser',
  server: 'LucidData servers',
  nobody: 'No key involved',
}

export const KEY_CUSTODY: KeyCustodyEntry[] = [
  {
    material: 'Master key',
    module: 'key-derivation.ts',
    derivedOrGenerated:
      'Derived in your browser from your password and your key salt with PBKDF2-SHA256, 600,000 iterations',
    heldBy: 'user_browser',
    protects: 'Every per-entry data key in your vault',
    note: 'It is never sent to the server and is held only in memory, so it is lost when the tab closes.',
  },
  {
    material: 'Per-entry data key (DEK)',
    module: 'client-crypto.ts',
    derivedOrGenerated: 'Generated fresh in your browser for each vault entry (AES-GCM 256)',
    heldBy: 'user_browser',
    protects: 'The contents of one vault entry',
    note: 'The server stores it only wrapped by your master key, so it cannot be unwrapped server side.',
  },
  {
    material: 'Recovery escrow key',
    module: 'recovery.ts',
    derivedOrGenerated:
      'Derived in your browser from your one-time recovery code with PBKDF2-SHA256, 600,000 iterations',
    heldBy: 'user_browser',
    protects: 'An escrowed copy of your master key, used after a password reset',
    note: 'The server stores the wrapped copy and the salt. It never sees the recovery code.',
  },
  {
    material: 'Vault export key',
    module: 'vault-export.ts',
    derivedOrGenerated: 'Your master key, used in the browser during export',
    heldBy: 'user_browser',
    protects: 'The decrypted export you download',
    note: 'Decryption happens in your browser. Plaintext never passes through the server.',
  },
  {
    material: 'Contribution anonymization',
    module: 'anonymize.ts',
    derivedOrGenerated: 'No key. Direct identifiers are stripped in your browser',
    heldBy: 'nobody',
    protects: 'Marketplace contributions before they leave your device',
    note: 'You choose which remaining fields to share. Removal happens before upload, not after.',
  },
  {
    material: 'Audit chain hashes',
    module: 'hashing.ts',
    derivedOrGenerated: 'SHA-256 computed on the server over event metadata',
    heldBy: 'nobody',
    protects: 'The integrity of your audit trail',
    note: 'Hashes are not encryption. They make tampering detectable, and they cover metadata only.',
  },
  {
    material: 'Issuer signing key',
    module: 'credential-signing.ts',
    derivedOrGenerated:
      'Ed25519 keypair generated on the server, private half AES-256-GCM-wrapped with ISSUER_KEY_SECRET',
    heldBy: 'server',
    protects: 'Credentials an organization issues about a person',
    note: 'This is server custody by design: an issuer signs a statement, so the signature must not depend on the subject being present.',
  },
  {
    material: 'Credential verification key',
    module: 'credential-verify.ts',
    derivedOrGenerated: 'The public half of an issuer key, published for verifiers',
    heldBy: 'server',
    protects: 'Nothing. It only checks signatures',
    note: 'Public by design. Anyone can verify a credential without an account.',
  },
  {
    material: 'Consent receipt signing key',
    module: 'consent-receipt.ts',
    derivedOrGenerated:
      'Ed25519 keypair generated on the server, private half AES-256-GCM-wrapped with ISSUER_KEY_SECRET',
    heldBy: 'server',
    protects: 'The signed statement of what you agreed to',
    note: 'Server custody by design: a receipt is LucidData attesting to the terms, and it carries no vault content.',
  },
  {
    material: 'Deletion receipt signing key',
    module: 'deletion-receipt.ts',
    derivedOrGenerated:
      'Ed25519 keypair generated on the server, private half AES-256-GCM-wrapped with ISSUER_KEY_SECRET',
    heldBy: 'server',
    protects: 'The signed statement of what was erased when you deleted your account',
    note: 'The receipt holds counts, table names, and a hash of your email. Your address is not stored, and the hash cannot be reversed to recover it.',
  },
  {
    material: 'Ingestion keypair',
    module: 'ingestion-keys.ts',
    derivedOrGenerated:
      'ECDH P-256 keypair generated in your browser. The public half is published; the private half is wrapped with your master key',
    heldBy: 'user_browser',
    protects: 'Records a connector fetches from a provider on your behalf',
    note: 'A sync runs while you are away, so it gets the public half only. It can write records it cannot read, and they stay sealed until you next unlock.',
  },
]

/**
 * Columns on vault_data that are stored unencrypted so entries can be listed,
 * filtered, and searched. Must match the vault_data schema in the migrations.
 */
export const SERVER_VISIBLE_VAULT_METADATA = [
  {
    column: 'label',
    purpose: 'The name you give an entry, shown in your vault list',
  },
  {
    column: 'category',
    purpose: 'Groups entries and drives consent scoping and marketplace eligibility',
  },
  {
    column: 'tags',
    purpose: 'Your own labels, used for filtering',
  },
  {
    column: 'schema_type',
    purpose: 'Which structured form the entry uses, so it can be rendered and mapped',
  },
]

export interface CertificationStatus {
  standard: string
  /** Strictly one of these. Never claim a standard is both achieved and in progress. */
  state: 'achieved' | 'in_progress' | 'not_started'
  detail: string
}

export const CERTIFICATIONS: CertificationStatus[] = [
  {
    standard: 'SOC 2 Type II',
    state: 'not_started',
    detail: 'No audit has been started. We will publish the report when one exists.',
  },
  {
    standard: 'ISO 27001',
    state: 'not_started',
    detail: 'No certification has been started.',
  },
  {
    standard: 'Independent penetration test',
    state: 'not_started',
    detail: 'No third-party test has been commissioned yet.',
  },
]

export interface Subprocessor {
  name: string
  role: string
  dataHandled: string
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: 'Supabase',
    role: 'Database, authentication, and realtime',
    dataHandled:
      'Account records, encrypted vault entries, consent and audit records, unencrypted vault metadata',
  },
  {
    name: 'Vercel',
    role: 'Application hosting',
    dataHandled: 'Request traffic and server logs. No vault plaintext, because none exists server side',
  },
  {
    name: 'Stripe',
    role: 'Payments and contributor payouts',
    dataHandled: 'Billing details and payout account details for organizations and contributors',
  },
  {
    name: 'Resend',
    role: 'Notification email, when configured',
    dataHandled: 'Email address, notification title, and message text. No vault content',
  },
]

/** What revocation can and cannot do, stated plainly. */
export const REVOCATION_LIMIT =
  'Revoking consent stops future access immediately. It cannot recall data that was already delivered. If you granted export access, the recipient holds a copy that no revocation can reach.'

export const VULNERABILITY_DISCLOSURE = {
  email: 'security@luciddata.app',
  policy:
    'Report a suspected vulnerability to the address above. Tell us what you found and how to reproduce it. We will acknowledge within three working days. Do not access, modify, or exfiltrate other people accounts or data while testing.',
}

export interface ThreatModelRow {
  threat: string
  mitigation: string
  residual: string
}

export const THREAT_MODEL: ThreatModelRow[] = [
  {
    threat: 'An attacker reads the database directly',
    mitigation:
      'Vault entries are encrypted in your browser under a key derived from your password. The database holds ciphertext and a wrapped data key.',
    residual:
      'Unencrypted metadata (label, category, tags, schema type) is readable, along with consent terms and audit records.',
  },
  {
    threat: 'A LucidData operator abuses privileged access',
    mitigation:
      'The service role cannot decrypt vault contents, because no server-held key opens them. Row level security scopes ordinary access to the account owner.',
    residual:
      'A privileged actor could read metadata and, today, could rewrite the audit table. External anchoring of the audit chain is not yet implemented.',
  },
  {
    threat: 'Someone gets your password',
    mitigation:
      'Second-factor authentication with an authenticator app, one-time backup codes, and passkeys are supported.',
    residual:
      'A password plus a live session on an unlocked device gives full vault access. Idle locking and per-action re-authentication are limited today.',
  },
  {
    threat: 'You lose your password and your recovery code',
    mitigation:
      'A recovery code escrows a wrapped copy of your master key, and you can hold more than one recovery factor.',
    residual:
      'If every factor is lost, the vault cannot be decrypted by anyone, including us. This is the cost of us not holding a key.',
  },
  {
    threat: 'A recipient misuses data you shared',
    mitigation:
      'Grants are time-bound, purpose-bound, revocable, and produce a signed receipt both parties keep.',
    residual: REVOCATION_LIMIT,
  },
  {
    threat: 'A fake organization contacts you',
    mitigation:
      'Organizations must verify control of their domain through DNS before they can issue credentials, and verified status is shown on the verification page.',
    residual:
      'Verified status proves domain control, not accreditation. It does not mean we vouch for the organization.',
  },
  {
    threat: 'A subprocessor is breached',
    mitigation:
      'Vault contents are ciphertext everywhere they are stored, so a storage breach does not yield plaintext.',
    residual:
      'Metadata, consent terms, audit records, and billing details held by a subprocessor would be exposed.',
  },
]
