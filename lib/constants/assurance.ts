/**
 * LD-107 assurance and procurement pack.
 *
 * Institutional buyers stall before any technical evaluation, at the point
 * their legal and risk functions ask for a processing agreement, a support
 * commitment, a residency statement, a recovery position, and evidence of
 * independent testing. This file is the single source for all of it.
 *
 * The rule from LD-101 applies with more force here, because these statements
 * end up in a contract: say what is true today. Nothing may be described as
 * both achieved and planned, and nothing that has not happened may be written
 * in a way that implies it has. A test enforces both.
 */

/** Where the service actually runs, not where we would like it to run. */
export interface ResidencyEntry {
  provider: string
  what: string
  region: string
  note: string
}

export const DATA_RESIDENCY: ResidencyEntry[] = [
  {
    provider: 'Supabase',
    what: 'Postgres database, authentication, and stored files',
    region: 'AWS us-west-2 (Oregon, United States)',
    note: 'This is the region the production project runs in. There is no EU or UK region today, and we do not offer a choice of region.',
  },
  {
    provider: 'Vercel',
    what: 'Application hosting and the scheduled job runner',
    region: 'United States, Vercel default region',
    note: 'Serverless functions run in Vercel default region. Static assets are served from their global edge network.',
  },
  {
    provider: 'Stripe',
    what: 'Payments, subscriptions, and contributor payouts',
    region: 'United States, with Stripe own global processing',
    note: 'Stripe holds transaction records under its own retention obligations, which we cannot shorten.',
  },
  {
    provider: 'Resend',
    what: 'Notification email, when configured',
    region: 'United States',
    note: 'Email carries a notification title and message text. It never carries vault content.',
  },
]

/**
 * The residency position stated once, so it cannot be softened by paraphrase in
 * a sales conversation.
 */
export const RESIDENCY_SUMMARY =
  'All personal data is processed in the United States today. We do not offer EU or UK data residency, and we will not claim otherwise. If your procurement requires in-region processing, LucidData does not meet that requirement yet.'

export interface SupportSeverity {
  level: string
  meaning: string
  targetResponse: string
  targetUpdate: string
}

/**
 * A support commitment procurement can hold us to. These are response targets,
 * not resolution guarantees, because a resolution time we cannot control is not
 * a commitment, it is a wish.
 */
export const SUPPORT_SEVERITIES: SupportSeverity[] = [
  {
    level: 'Severity 1',
    meaning: 'The service is unavailable, or data is at risk of loss or exposure.',
    targetResponse: '2 hours',
    targetUpdate: 'Every 4 hours until resolved',
  },
  {
    level: 'Severity 2',
    meaning: 'A core function is unusable and there is no workaround.',
    targetResponse: '1 working day',
    targetUpdate: 'Every working day',
  },
  {
    level: 'Severity 3',
    meaning: 'A function is degraded, or there is a workaround.',
    targetResponse: '3 working days',
    targetUpdate: 'On change',
  },
  {
    level: 'Severity 4',
    meaning: 'A question, a documentation issue, or a feature request.',
    targetResponse: '5 working days',
    targetUpdate: 'On change',
  },
]

export const SUPPORT_HOURS =
  'Monday to Friday, 09:00 to 17:00 UK time, excluding public holidays. Severity 1 reports are monitored outside those hours.'

export const SUPPORT_CONTACT = 'support@luciddatabank.com'

/**
 * Availability. Stated as a target rather than a contractual SLA with credits,
 * because we do not operate a credit scheme and inventing one would be a claim
 * we could not honour.
 */
export const AVAILABILITY_TARGET = {
  target: '99.5% monthly, excluding planned maintenance',
  measured: false,
  note: 'This is our operating target. We do not yet publish measured uptime, and there is no service credit scheme. Both are recorded as planned work rather than described as in place.',
}

export interface RecoveryObjective {
  scenario: string
  /** Recovery point objective: how much data could be lost. */
  rpo: string
  /** Recovery time objective: how long recovery should take. */
  rto: string
  mechanism: string
  /** ISO date of the last drill, or null when no drill has been run. */
  lastTestedAt: string | null
}

export const RECOVERY_OBJECTIVES: RecoveryObjective[] = [
  {
    scenario: 'Database loss or corruption',
    rpo: '24 hours',
    rto: '8 hours',
    mechanism: 'Supabase daily automated backups with point-in-time recovery on paid plans.',
    lastTestedAt: null,
  },
  {
    scenario: 'Application hosting failure',
    rpo: 'None. The application holds no state.',
    rto: '1 hour',
    mechanism: 'Redeploy from the Git repository. Every environment variable is reproducible.',
    lastTestedAt: null,
  },
  {
    scenario: 'Loss of the issuer signing secret',
    rpo: 'None for vault data. Issued credentials become unverifiable.',
    rto: 'Not recoverable. Keys must be rotated and credentials reissued.',
    mechanism:
      'Issuer key rotation under LD-406. Existing credentials signed by the lost key cannot be recovered.',
    lastTestedAt: null,
  },
]

/**
 * Stated plainly rather than buried. An untested recovery plan is a document,
 * not a capability, and a buyer is entitled to know which one they are reading.
 */
export const RECOVERY_TESTING_STATEMENT =
  'No recovery drill has been performed. The objectives above are design targets derived from our provider capabilities, not measurements. We will publish the date and outcome of the first drill here when it happens.'

export interface IncidentRole {
  role: string
  responsibility: string
}

export const INCIDENT_ROLES: IncidentRole[] = [
  {
    role: 'Incident lead',
    responsibility:
      'Declares the incident, owns the timeline, and is the single decision maker. Nobody else may stand the incident down.',
  },
  {
    role: 'Technical responder',
    responsibility: 'Investigates, mitigates, and records every action with a timestamp.',
  },
  {
    role: 'Communications owner',
    responsibility:
      'Writes user and regulator notifications, and is the only person who sends them.',
  },
]

export interface IncidentStep {
  step: string
  detail: string
  deadline: string
}

/**
 * The runbook, written so it can be followed under pressure by someone who did
 * not write it. Timings are measured from declaration, not from discovery,
 * except where the law says otherwise.
 */
export const INCIDENT_STEPS: IncidentStep[] = [
  {
    step: 'Declare',
    detail:
      'Anyone may raise a suspected incident to security@luciddatabank.com. The incident lead declares it and starts a timestamped log.',
    deadline: 'Immediately on suspicion. Declaring and standing down costs nothing.',
  },
  {
    step: 'Contain',
    detail:
      'Revoke affected credentials and API keys, and disable the affected path. Containment comes before investigation.',
    deadline: 'Within 1 hour of declaration',
  },
  {
    step: 'Identify who is affected',
    detail:
      'Query the audit chain and the relevant tables to produce the exact list of affected accounts. The chain is per user and tamper evident, so the list is evidence rather than an estimate.',
    deadline: 'Within 12 hours of declaration',
  },
  {
    step: 'Notify the regulator',
    detail:
      'Where a personal data breach is likely to result in a risk to people, notify the lead supervisory authority. Record the decision and its reasoning either way.',
    deadline: '72 hours from becoming aware, per GDPR Article 33',
  },
  {
    step: 'Notify affected people',
    detail:
      'Where the risk is high, tell affected people directly, in plain language, using the template below. Do not wait for a complete picture if that would delay the warning.',
    deadline: 'Without undue delay, per GDPR Article 34',
  },
  {
    step: 'Review',
    detail:
      'Write up what happened, what we changed, and what we would do differently. Publish the summary unless doing so would put people at further risk.',
    deadline: 'Within 10 working days of resolution',
  },
]

export const BREACH_NOTIFICATION_TEMPLATE = {
  regulator: `We are notifying you of a personal data breach under Article 33.

What happened: [factual description, no speculation]
When we became aware: [date and time, UTC]
Categories of data: [what was affected, and whether it was encrypted]
Approximate number of people affected: [number, and how it was determined]
Likely consequences: [assessment]
Measures taken: [containment and mitigation, with timestamps]
Contact: [name and role of the incident lead]`,
  user: `We need to tell you about a security incident affecting your LucidData account.

What happened: [plain description]
What this means for your data: [state whether vault contents were reachable. Vault entries are encrypted in your browser with a key we never hold, so [state plainly whether that protection held]]
What we have done: [containment]
What you should do: [specific action, or "no action is needed" if that is true]
Where to ask: security@luciddatabank.com`,
}

export interface ContinuityCommitment {
  question: string
  answer: string
}

export const CONTINUITY: ContinuityCommitment[] = [
  {
    question: 'What happens to my data if LucidData shuts down?',
    answer:
      'We would give at least 90 days notice and keep the export working for the whole of it. Your vault export runs in your browser, so it does not depend on us staying solvent enough to run a server-side job.',
  },
  {
    question: 'Can I get my data out without your help?',
    answer:
      'Yes. Export produces JSON decrypted in your browser. Issued credentials export with their signature and the issuer public key, so a third party can verify them without contacting us.',
  },
  {
    question: 'What happens to consent grants I have given?',
    answer:
      'Grants are enforced by our access checks, so they end when the service does. A recipient who already exported a copy still holds it. That limit is stated on every export order and on the trust centre.',
  },
  {
    question: 'Is there an escrow arrangement?',
    answer:
      'No. There is no source code escrow and no third-party data escrow. We would not want a buyer to assume one exists.',
  },
]

export interface QuestionnaireAnswer {
  question: string
  answer: string
}

/**
 * The questions every security questionnaire asks, answered once so the answers
 * cannot drift between one response and the next.
 */
export const SECURITY_QUESTIONNAIRE: QuestionnaireAnswer[] = [
  {
    question: 'Is customer data encrypted at rest?',
    answer:
      'Vault entries are encrypted in the browser with AES-256-GCM before they reach us, under a key derived from the user password with PBKDF2-SHA256 at 600,000 iterations. We cannot decrypt them. The database is additionally encrypted at rest by the provider.',
  },
  {
    question: 'Is customer data encrypted in transit?',
    answer: 'Yes. TLS on every connection, enforced by both the application host and the database provider.',
  },
  {
    question: 'Who can access production data?',
    answer:
      'Vault contents cannot be accessed by anyone but the user, including us. Unencrypted metadata and account records are reachable by the service role, which is used only by server code and never exposed to a browser.',
  },
  {
    question: 'Do you have multi-factor authentication?',
    answer:
      'Yes. Passkeys (WebAuthn) and TOTP, with backup codes. Destructive actions additionally require a password re-entry within the previous two minutes.',
  },
  {
    question: 'How do you handle access logging?',
    answer:
      'Every read, write, grant, and revocation writes to a per-user SHA-256 hash chain. Any modification to a past entry breaks the chain and is detectable. Users can verify their own chain.',
  },
  {
    question: 'Have you had a penetration test?',
    answer:
      'No. No third-party test has been commissioned. We run dependency auditing and publish a vulnerability disclosure address.',
  },
  {
    question: 'Are you ISO 27001 or SOC 2 certified?',
    answer: 'No. Neither certification has been started.',
  },
  {
    question: 'Do you use subprocessors?',
    answer:
      'Yes: Supabase, Vercel, Stripe, and Resend. Each is listed on the trust centre with the data it handles.',
  },
  {
    question: 'How long do you keep data?',
    answer:
      'Answered requests for 90 days, share links for 30 days after they die, notifications for 180 days, and purchased dataset records until the buyer download window or the declared retention period ends, whichever is first. The windows are published on the trust centre and enforced by a scheduled job.',
  },
  {
    question: 'How do you handle deletion?',
    answer:
      'Deletion is explicit rather than left to database cascades, is verified afterwards, and produces a signed receipt listing what was removed and what a payment provider still has to keep.',
  },
]

/** Terms a processing agreement has to state. Not legal advice, and not signed. */
export interface ProcessingTerm {
  clause: string
  position: string
}

export const PROCESSING_TERMS: ProcessingTerm[] = [
  {
    clause: 'Roles',
    position:
      'For an organization account, LucidData is the processor and the organization is the controller. For an individual account, LucidData is the controller of the account record and cannot be a processor of vault contents, because it cannot read them.',
  },
  {
    clause: 'Subject matter and duration',
    position:
      'Processing lasts for the term of the account and ends on deletion, subject to the retention windows published on the trust centre.',
  },
  {
    clause: 'Instructions',
    position:
      'We process personal data only on documented instructions, which are the actions taken through the product and its API.',
  },
  {
    clause: 'Confidentiality',
    position: 'Anyone with access to personal data is bound by confidentiality obligations.',
  },
  {
    clause: 'Security measures',
    position:
      'Client-side encryption of vault contents, row level security on every table, a tamper-evident audit chain, multi-factor authentication, and step-up re-authentication for destructive actions.',
  },
  {
    clause: 'Subprocessors',
    position:
      'The list is published on the trust centre. We give 30 days notice before adding one, and you may object.',
  },
  {
    clause: 'Assistance with data subject rights',
    position:
      'The rights engine handles access, correction, deletion, restriction, and portability requests with jurisdiction-aware deadlines, and records every step.',
  },
  {
    clause: 'Breach notification',
    position:
      'We notify the controller without undue delay after becoming aware of a personal data breach, following the published incident runbook.',
  },
  {
    clause: 'International transfers',
    position:
      'Personal data is processed in the United States. Transfers from the EU or UK rely on Standard Contractual Clauses. There is no in-region processing option today.',
  },
  {
    clause: 'Deletion and return',
    position:
      'On termination, data is deleted through the same explicit deletion path used by account deletion, and a signed receipt is issued.',
  },
  {
    clause: 'Audit',
    position:
      'We answer a security questionnaire and provide the published documentation. We do not currently support on-site audits or bespoke audit rights.',
  },
]

export const PROCUREMENT_CONTACT = 'legal@luciddatabank.com'
