# Competitive feature roadmap

Research date: 2026-07-25
Last delivery update: 2026-10-07
Status: active. **Phase 1 and Phase 2 are delivered. Phase 3 and Phase 4 are in progress.**
Phase 1: [section 6.1](#61-phase-1-delivery-record) for the record, [section 6.2](#62-implications-for-later-phases) for what changed underneath the remaining specs.
Phase 2: [section 6.4](#64-phase-2-delivery-record) for the record, [section 6.5](#65-defects-found-while-building-phase-2) for defects found on the way, and [section 6.6](#66-what-is-left-in-phase-2) for what remains and in what order.
Phase 3: [section 6.9](#69-phase-3-delivery-record) for the record.
Phase 4: [section 6.10](#610-phase-4-delivery-record) for the record, and [section 6.11](#611-the-ci-failure-and-why-it-went-unnoticed) for a CI failure worth reading before trusting a green deployment.
Cross-cutting: [section 6.13](#613-every-error-message-was-being-thrown-away-in-production) for why a server action must return an expected failure rather than throw it.
Direction: re-sequenced 2026-10-05 around personal health and fitness data, US first, with the web app, iOS and Android apps, and Chrome, Edge, Firefox, and Safari extensions all in scope. [Section 6.14](#614-re-sequencing-for-the-health-and-fitness-focus) has the new order and [section 8.1](#81-decisions-taken) the decisions behind it.
Owner: product
Audience: agentic coding tools and the engineers reviewing their output

> **This is the single definitive roadmap for LucidData.** It is the prioritized list of features
> to be developed and gaps to be closed. If any other file in this repository describes planned,
> upcoming, or deferred work, this document overrides it. Do not plan from the README, from design
> documents under `docs/`, or from code comments.

## 1. How to use this document

This document turns competitor research into buildable work. It has four parts:

1. A verified baseline of what LucidData ships today, cited to workspace paths.
2. An evidence-linked competitor matrix with primary sources.
3. A prioritized gap analysis with scoring.
4. Numbered feature specs an agent can execute one at a time.

Rules for any agent executing a spec here:

- Read [AGENTS.md](../AGENTS.md) first. The security rules there override anything in this document.
- Implement one spec ID per branch and pull request. Do not batch unrelated specs.
- Treat the acceptance criteria as the definition of done. If a criterion cannot be met, stop and report rather than weakening it.
- Every new table needs row level security with `(SELECT auth.uid())`-scoped policies in the same migration.
- Pick a fresh `YYYYMMDDHHMMSS` migration timestamp at execution time. The timestamps below are placeholders.
- Do not weaken browser-side encryption to make a spec easier. Specs that change the trust model say so explicitly and carry a threat-model task.

Confidence labels used throughout: `verified` means confirmed in this workspace or in a cited primary source, `reported` means a vendor claim that was not independently checked, and `inferred` means analysis.

### 1.1 Superseded planning documents

These sections previously described planned work. They are superseded by this document and have
been pointed here. Nothing was dropped in the merge; every item is mapped below.

| Superseded source | Old item | Now tracked as |
|---|---|---|
| README, `Deferred to beta and later` | Additional data schemas, FHIR and Open Banking | LD-203 for import adapters. Partner pilots appear in phase 4 and open decision 5 |
| README, `Deferred to beta and later` | DID support | LD-401 non-goals. Gated on a signed partner use case, see open decision 5 |
| README, `Deferred to beta and later` | Mobile apps | LD-204, rescoped from a full client to data capture |
| README, `In progress` | Production rollout | Operational task, not a feature. Tracked outside this roadmap |
| [vault-data-ingestion.md](vault-data-ingestion.md) section 9 | Phase 1, structured entry | Shipped |
| [vault-data-ingestion.md](vault-data-ingestion.md) section 9 | Phase 2, file import | Shipped |
| [vault-data-ingestion.md](vault-data-ingestion.md) section 9 | Phase 3, provider exports | LD-203 |
| [vault-data-ingestion.md](vault-data-ingestion.md) section 9 | Phase 4, connectors | LD-201 |
| [vault-data-ingestion.md](vault-data-ingestion.md) section 9 | Phase 5, continuous capture | LD-204 and LD-205. Continuous browsing capture stays out of scope, see 1.2 |
| [vault-data-ingestion.md](vault-data-ingestion.md) section 9 | Cross-cutting anonymization hardening | LD-501 |

[vault-data-ingestion.md](vault-data-ingestion.md) remains valid as a design document. Use it for
the ingestion architecture and the sealed-box key design. Do not use it for priority order.

### 1.2 Out of scope for this roadmap

These are deliberately excluded from the next 12 months. Adopting any of them requires a new spec ID in
this document rather than a note elsewhere.

- Browsing capture that is not preceded by user-facing transparency. Collection is in scope through LD-206 and LD-207, but the order is fixed: the extension must show the user who is tracking them before it ever offers to monetize their browsing. Shipping collection first would make LucidData the thing it criticises.
- Native clients that duplicate the whole web application. Since 2026-10-05, LD-204 covers capture, the vault, the health timeline, sharing, and settings. The marketplace, payouts, and the organization portal stay on the web.
- Blockchain or token mechanics of the kind Vana uses.
- Self-hosting and single-tenant deployment.

## 2. Verified baseline

> This section records the baseline **as it was on 2026-07-25, before Phase 1**. It is kept as the
> reference point the gap analysis in section 4 was scored against. For what has shipped since, read
> [section 6.1](#61-phase-1-delivery-record). Where a line below is now out of date, it says so.

LucidData is further along than its README implies. The audit found 24 product pages, 19 server-action domains, 24 services, and 22 migrations. The following are confirmed present in the workspace.

Individual-facing:

| Capability | Evidence |
|---|---|
| Browser-side envelope encryption, PBKDF2 600k plus AES-GCM | [packages/core/src/crypto/key-derivation.ts](../packages/core/src/crypto/key-derivation.ts), [packages/core/src/crypto/client-crypto.ts](../packages/core/src/crypto/client-crypto.ts) |
| Vault CRUD with typed schema forms and a custom field builder | [lib/actions/vault.actions.ts](../lib/actions/vault.actions.ts), [components/vault/key-value-builder.tsx](../components/vault/key-value-builder.tsx) |
| File import with column mapping, parsed in the browser | [packages/core/src/vault/import-parsers.ts](../packages/core/src/vault/import-parsers.ts), [components/vault/vault-import-dialog.tsx](../components/vault/vault-import-dialog.tsx) |
| Time-bound consent with a required purpose | [packages/core/src/validations/consent.ts](../packages/core/src/validations/consent.ts) |
| Hash-chained audit log with tamper verification | [lib/crypto/hashing.ts](../lib/crypto/hashing.ts) |
| JSON-LD vault export decrypted in the browser | [packages/core/src/crypto/vault-export.ts](../packages/core/src/crypto/vault-export.ts) |
| TOTP second factor, backup codes, passkeys | [lib/services/mfa.service.ts](../lib/services/mfa.service.ts), [components/auth/passkey-login-button.tsx](../components/auth/passkey-login-button.tsx) |
| Account deletion and recovery-code escrow | [lib/services/account.service.ts](../lib/services/account.service.ts) |
| Marketplace contribution and Stripe Connect payouts | [lib/services/contribution.service.ts](../lib/services/contribution.service.ts), [lib/services/payout.service.ts](../lib/services/payout.service.ts) |

Organization-facing:

| Capability | Evidence |
|---|---|
| Org registration, roles, membership gate | [lib/middleware/withOrgMember.ts](../lib/middleware/withOrgMember.ts) |
| DNS domain verification before issuance | [lib/actions/issuer.actions.ts](../lib/actions/issuer.actions.ts) |
| Ed25519 credential issuance with wrapped issuer keys | [lib/services/credential.service.ts](../lib/services/credential.service.ts) |
| Credential revocation from the issuer UI | [components/org/issue-credential.tsx](../components/org/issue-credential.tsx) |
| API key management | [components/org/api-key-manager.tsx](../components/org/api-key-manager.tsx) |
| Public verification without an account | [app/verify/[token]/page.tsx](../app/verify/%5Btoken%5D/page.tsx) |
| Data pools, offers, orders, Stripe Checkout | [lib/services/data-order.service.ts](../lib/services/data-order.service.ts) |
| Subscription billing | [lib/services/stripe-billing.service.ts](../lib/services/stripe-billing.service.ts) |

Three claims in the internal audit were wrong and are corrected here: credential revocation has a UI, API key management exists, and account deletion is implemented. Do not write specs for those.

Confirmed absent, verified by search:

- No `data_sources` table and no `users.ingest_public_key`, so server-side connectors cannot write data the server cannot read. **Still true.** LD-201 remains unbuilt.
- ~~No Global Privacy Control or universal opt-out handling anywhere in `lib/`.~~ **Closed by LD-302 on 2026-07-26.**
- No k-anonymity or differential privacy. The only cohort protection is a `minimum_contributors` count checked at purchase time in [lib/services/data-order.service.ts](../lib/services/data-order.service.ts). **Still true.** LD-501 remains unbuilt and is the single largest open risk in the marketplace.

## 3. Competitor matrix

Checked 2026-07-25 from public sources. No accounts were created.

### Direct competitors

| Product | Category | Key custody | Consent model | Monetization | Relevance |
|---|---|---|---|---|---|
| [Inrupt / Solid](https://www.inrupt.com/products/enterprise-wallet-infrastructure) | Enterprise personal data store infrastructure | Pod-based, deployment dependent | Signed access grants with purpose, duration, expiry, revocation, audit | Enterprise licensing, no public price | Strongest interoperability reference. Its [wallet is Developer Preview](https://docs.inrupt.com/wallet/introduction) and warns against production personal data |
| [Meeco](https://www.meeco.me/vault) | Vault plus credential platform | Owner passphrase for vault, customer-held server keys for the credential wallet | Field-level, time-bound shares, delegation, onward-sharing rules | Enterprise quote | Closest full-feature competitor. Publishes [ISO 27001:2022](https://www.meeco.me/security) and supports [SD-JWT VC and mdoc](https://www.meeco.me/standards-specifications-and-working-groups) |
| [Mydex](https://mydex.org/) | Community interest company personal data store | Operator-managed | Organization-delivered verified data with consent | Service providers pay, stores free to citizens for life | Best governance model. Asset lock and reinvestment requirement substitute for a trust slogan |
| [digi.me](https://digi.me/) | Health record vault | Operator states no access to contents | Consent-based sharing of a patient summary | Paid in-app export subscription | Shows the value of narrowing to one vertical instead of a universal connector catalog |
| [Dataswyft / HAT](https://www.dataswyft.com/) | Personal data accounts | Personal microserver | Ecosystem-governed | Enterprise-led | Separates ecosystem governance from the commercial operator |
| [Cozy / Twake](https://en.cozy.io/) | Open-source personal cloud | Partial. [Security docs](https://docs.cozy.io/en/cozy-stack/security/) state only selected sensitive fields are encrypted before storage | App permissions, grants, OAuth2 | [5 GB free, EUR 4 for 50 GB, EUR 12 for 1 TB](https://en.cozy.io/pricing) | Best connector reference. Repositioning toward workplace shows monetization pressure |
| [Vana](https://docs.vana.org/) | Protocol for portable data and AI training | Local encryption, ciphertext sync | Record-level revocable on-chain grants with an access log | Tokenized data rights | Closest to LucidData's full loop. [Warns control ends once plaintext reaches a grantee](https://docs.vana.org/applications/confidential-compute) |
| [Reklaim](https://reklaimyou.com/how-it-works) | Consumer data rewards plus B2B data platform | Operator-held | Broad opt-in, revocable | Surveys, prize draws, B2B licensing | Proves buyer demand. Its [privacy policy](https://reklaimyou.com/privacy) confirms it licenses or sells user data, which is the trust trap to avoid |
| [Gener8](https://gener8ads.com/) | Consumer rewards | Operator-held | Broad opt-in | Points for gift cards | Best acquisition UX, weakest sovereignty. Reports 500,000+ users |
| [CitizenMe](https://www.citizenme.com/) | Former consumer marketplace, now succeeded by DataSapien | On-device | Per-offer accept or reject with disclosed reward | Pivoted | Most important failure lesson. A well-designed standalone wallet did not survive as a consumer product |
| [DataSapien](https://datasapien.com/about/) | Device-native AI personalisation platform sold to brands as an SDK | On-device, inside the brand's own app. Personal data is not uploaded to a corporate cloud | Brand authors the journey, the person controls what is shared back | Per-user licensing rather than per interaction | Competes for the organization budget, not for individuals. Built by the CitizenMe team, who report patents on on-device data vaults and prior work on a personal data store with 500,000 monthly active users |

DataSapien deserves separate comment because it is the CitizenMe lesson turned into a business.
It does not compete for individuals at all: no one signs up for DataSapien, because it ships inside
brands' existing apps. It competes for the same enterprise budget LucidData's organization tooling
targets, and it reaches consumers through distribution LucidData would have to build. Its own
[about page](https://datasapien.com/about/) says the founding team previously built "the world's most
widely used on-device personal data store" and "the first commercial personal data exchange," then
chose to rebuild as embedded infrastructure. That is the same founder concluding twice that the
standalone consumer data app is the harder path.

Two practical takeaways. First, it validates open decision 5: LucidData's defensible ground is
verified data and credentials that a personalisation SDK cannot produce, not raw behavioural context.
Second, its site simultaneously claims "SOC 2 Type II" and "SOC 2 II and ISO 27001 underway," which
is exactly the ambiguity LD-101 must avoid.

Category patterns, inferred:

1. No reviewed competitor publicly combines browser-held keys, structured consent, credentials, a marketplace, payments, and organization tooling. LucidData's breadth is genuinely unusual.
2. Horizontal personal data apps narrow or pivot. digi.me went to health, Cozy to workplace, CitizenMe to an embedded SDK, Reklaim to surveys and sweepstakes.
3. Acquisition is harder than storage. Survivors rely on connectors, institutional issuers, or browser extensions.
4. Encrypted is not a category. Key custody varies from browser-held to operator-held, and buyers increasingly ask which one applies.
5. Direct data dividends are rare. Surveys, vouchers, and prize draws dominate, which leaves an opening for transparent pricing.
6. On-device processing is being sold to enterprises as a compliance and signal-quality argument, not as user sovereignty. DataSapien shows a competitor can adopt LucidData's architecture while serving the brand rather than the person. Browser-held keys plus a consent receipt the user owns is what separates the two.

### Adjacent expectations

These products set the bar users and buyers will judge LucidData against.

| Product | Pattern LucidData should absorb | Source |
|---|---|---|
| Optery | Free scan with screenshot-backed proof of work before payment. SOC 2 Type II and a public architecture page | [Pricing](https://www.optery.com/pricing/), [Security](https://www.optery.com/optery-security/) |
| Incogni | Per-broker expected completion times and recurring rescans | [Incogni](https://incogni.com/) |
| Plaid | Institution chooser, explicit scopes, reconnect repair flow, returning-user shortcuts | [Link overview](https://plaid.com/docs/link/) |
| Terra | One integration covering onboarding, backfill, ongoing webhooks, and writes. From USD 499 per month | [Docs](https://docs.tryterra.co/), [Pricing](https://tryterra.co/pricing) |
| Apple Health | Field-level source provenance and deterministic source priority | [Manage Health data](https://support.apple.com/en-us/108779) |
| Android Health Connect | A permission dashboard that states connected services keep their own copies | [Health Connect](https://developer.android.com/health-and-fitness/health-connect) |
| SpruceID | Short-lived single-use verification sessions, wallet auto-detection | [Verify docs](https://docs.verify.spruceid.com/getting-started/overview/) |
| Entra Verified ID | Returning a match result rather than the underlying biometric | [Architecture](https://learn.microsoft.com/en-us/entra/verified-id/introduction-to-verifiable-credentials-architecture) |
| EUDI wallet | Attribute-level disclosure and disclosure history | [ARF](https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework) |
| Snowflake Marketplace | Live governed read-only access with provider revocation instead of shipping copies | [Secure data sharing](https://docs.snowflake.com/en/user-guide/data-sharing-intro) |
| Databricks Clean Rooms | Mutually approved computation, read-only outputs, versioned code approval | [Clean Rooms](https://docs.databricks.com/aws/en/clean-rooms/) |
| AWS Data Exchange | Entitlements as explicit objects, including private grants | [What is AWS Data Exchange](https://docs.aws.amazon.com/data-exchange/latest/userguide/what-is.html) |

### Regulatory drivers

| Authority | Requirement created | Urgency | Source |
|---|---|---|---|
| GDPR | Authenticated rights cases for access, correction, deletion, restriction, portability, with a one-month clock. Withdrawal must be as easy as granting | P0 | [EDPB access guidelines](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en), [portability](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-right-data-portability-under-regulation-2016679_en) |
| US state privacy | Access, correction, deletion, portability, appeals, authorised agents, sensitive-data consent, and recognised universal opt-out signals | P0 | [CCPA](https://oag.ca.gov/privacy/ccpa), [GPC](https://oag.ca.gov/privacy/ccpa/gpc) |
| UK DUAA | Stop-the-clock events on subject access, records of reasonable and proportionate searches, safeguards on significant automated decisions | P0 | [DUAA changes](https://www.gov.uk/guidance/data-use-and-access-act-2025-data-protection-and-privacy-changes) |
| EU Data Governance Act | If LucidData positions itself as a data intermediation service, the regulated activity must be separated and unrelated use prohibited | P0 role decision | [DGA](https://digital-strategy.ec.europa.eu/en/policies/data-governance-act) |
| EU Data Act | Export, open interfaces, switching assistance, and no egress charges from 12 January 2027 if in scope | P0 if in scope | [Data Act](https://digital-strategy.ec.europa.eu/en/policies/data-act) |
| eIDAS 2 / EUDI | Relying parties must register, declare purpose, request minimal attributes, and issue disclosure receipts. Member states must offer wallets by end of 2026 | P1 | [EUDI regulation](https://digital-strategy.ec.europa.eu/en/policies/eudi-regulation) |
| W3C and OpenID | VC 2.0, OpenID4VCI 1.0, and OpenID4VP 1.0 are final. SD-JWT is RFC 9901 while SD-JWT VC remains a draft | P1, version-gated | [VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/), [OpenID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html), [RFC 9901](https://www.rfc-editor.org/rfc/rfc9901.html) |
| CFPB 1033 | Compliance dates stayed on 29 October 2025. Keep financial connectivity feature-flagged and claim no deadline | Monitor | [CFPB](https://www.consumerfinance.gov/rules-policy/rules-under-development/personal-financial-data-rights/) |
| FTC Health Breach Notification Rule | A vendor of personal health records outside HIPAA must notify affected people and the FTC after a breach of unsecured health data, and the media when a breach is large. The 2024 amendments made clear that health apps drawing on several sources are covered | P0 for the health focus | [FTC](https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule) |
| Washington My Health My Data Act | Consent before collecting or sharing consumer health data, a signed authorization before any sale, deletion on request, and a separate consumer health data privacy policy linked from the homepage. Enforced by the attorney general and through private action | P0 for the health focus | [Washington AG](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy) |
| Apple App Review 5.1.1 and 5.1.3 | HealthKit data may not be used for advertising or data mining, or disclosed to third parties except for health management or consented research. No health data in iCloud. A privacy policy inside the app, in-app account deletion, and a legal entity rather than an individual as the submitter of a health app | P0 for the iOS app | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) |

## 4. Gap analysis

Scoring is 1 to 5. Priority is a judgement, not a formula, but it follows the scores.

| ID | Gap | Individual | Org | Differentiation | Trust | Revenue | Effort | Confidence | Priority |
|---|---|---|---|---|---|---|---|---|---|
| LD-201 | No live connectors, so vaults start empty | 5 | 4 | 3 | 3 | 4 | 5 | verified | P0 |
| LD-101 | No inspectable trust evidence or key-custody statement | 4 | 5 | 5 | 5 | 4 | 2 | verified | P0 |
| LD-301 | No rights and DSAR engine | 4 | 4 | 3 | 5 | 3 | 4 | verified | P0 |
| LD-302 | No universal opt-out signal handling | 3 | 3 | 2 | 5 | 2 | 2 | verified | P0 |
| LD-102 | Notification email is not delivered in production | 4 | 4 | 1 | 4 | 3 | 1 | verified | P0 |
| LD-303 | Consent has no portable signed receipt | 4 | 5 | 5 | 5 | 3 | 3 | verified | P0 |
| LD-501 | Anonymization is a contributor count only | 3 | 5 | 4 | 5 | 4 | 4 | verified | P0 |
| LD-601 | No scheduled jobs, so payouts and expiries stall | 4 | 3 | 1 | 4 | 3 | 2 | verified | P0 |
| LD-602 | Organizations have no developer surface, so integration is hand-rolled | 1 | 5 | 3 | 3 | 5 | 3 | verified | P0 |
| LD-603 | Organizations cannot add a second team member | 1 | 5 | 1 | 3 | 5 | 2 | verified | P0 |
| LD-107 | No processing agreement, availability commitment, or residency statement | 1 | 5 | 2 | 5 | 5 | 3 | verified | P0 |
| LD-105 | A lost password plus a lost recovery code destroys the vault | 5 | 2 | 3 | 5 | 3 | 3 | verified | P0 |
| LD-106 | No idle lock, step-up authentication, or session revocation | 4 | 3 | 2 | 5 | 2 | 3 | verified | P0 |
| LD-406 | Issuer keys cannot be rotated and survive compromise | 2 | 5 | 3 | 5 | 3 | 3 | verified | P0 |
| LD-109 | Anyone can register an organization and contact users | 4 | 3 | 2 | 5 | 3 | 3 | verified | P0 |
| LD-505 | The marketplace loses money as pools grow | 3 | 4 | 2 | 3 | 5 | 3 | verified | P0 |
| LD-607 | Deleted accounts leave personal data behind | 4 | 3 | 2 | 5 | 2 | 3 | verified | P0 |
| LD-110 | No terms of service, privacy policy, or consumer health privacy policy | 5 | 5 | 2 | 5 | 4 | 2 | verified | P0 |
| LD-111 | Marketing promises earnings the product cannot deliver | 4 | 2 | 2 | 5 | 3 | 1 | verified | P0 |
| LD-208 | Connectors are hard-coded per provider, with no backfill, push delivery, or terms policy | 4 | 3 | 3 | 4 | 3 | 4 | verified | P0 |
| LD-209 | No schemas for sleep, vitals, body measurements, or nutrition | 5 | 3 | 2 | 2 | 3 | 2 | verified | P0 |
| LD-210 | Health exports arrive as zip files the importer cannot open | 5 | 1 | 2 | 2 | 2 | 2 | verified | P0 |
| LD-212 | The extension cannot be installed from any browser store | 4 | 2 | 3 | 3 | 2 | 3 | verified | P0 |
| LD-214 | Imported health data has no timeline or trend view | 5 | 2 | 3 | 2 | 4 | 3 | inferred | P0 |
| LD-608 | Product logic is reachable only through Next.js server actions | 3 | 4 | 2 | 3 | 3 | 4 | verified | P0 |
| LD-609 | Code the apps must share lives inside the web package | 2 | 2 | 1 | 3 | 2 | 3 | verified | P0 |
| LD-610 | Production runs on hobby tiers with no staging, monitoring, or analytics | 3 | 5 | 1 | 5 | 3 | 3 | verified | P0 |
| LD-204 | Health platform data is unreachable from a browser | 5 | 3 | 4 | 3 | 4 | 5 | verified | P0 |
| LD-104 | No access path when a user dies or loses capacity | 5 | 2 | 5 | 4 | 3 | 4 | verified | P1 |
| LD-405 | Incorrect credentials cannot be corrected or superseded | 4 | 5 | 3 | 4 | 3 | 3 | verified | P1 |
| LD-605 | Privileged access is unattributed and the audit chain is not anchored | 2 | 5 | 4 | 5 | 3 | 4 | verified | P1 |
| LD-604 | No bulk or asynchronous organization operations | 1 | 5 | 2 | 2 | 5 | 3 | verified | P1 |
| LD-108 | No accessibility conformance evidence | 3 | 4 | 1 | 3 | 3 | 3 | verified | P1 |
| LD-506 | Payouts can be farmed with fabricated or duplicated data | 2 | 4 | 2 | 4 | 3 | 3 | verified | P1 |
| LD-606 | No way to report, block, or suspend a bad actor | 3 | 3 | 2 | 4 | 2 | 3 | verified | P1 |
| LD-206 | Users cannot see who is collecting data on them | 5 | 2 | 5 | 5 | 3 | 3 | inferred | P1 |
| LD-404 | Credentials cannot be presented or checked in person | 5 | 4 | 5 | 4 | 4 | 4 | inferred | P1 |
| LD-401 | Credentials are not standards-interoperable | 3 | 5 | 5 | 4 | 4 | 5 | verified | P1 |
| LD-502 | Marketplace ships copies, not governed access | 3 | 5 | 5 | 5 | 5 | 5 | verified | P1 |
| LD-402 | No derived proofs such as age or income band | 4 | 5 | 5 | 4 | 4 | 4 | verified | P1 |
| LD-202 | No sync health surface or provenance | 4 | 3 | 3 | 4 | 2 | 3 | verified | P1 |
| LD-503 | Buyers cannot evaluate supply before purchase | 2 | 5 | 3 | 3 | 5 | 3 | verified | P1 |
| LD-304 | Export exists but import round-trip does not | 4 | 2 | 4 | 4 | 2 | 3 | verified | P1 |
| LD-112 | Passkey sign-in still asks for the password, and every reload locks the vault | 5 | 1 | 3 | 3 | 3 | 3 | verified | P1 |
| LD-211 | No route for US medical records | 5 | 3 | 4 | 3 | 3 | 4 | inferred | P1 |
| LD-305 | A person cannot share a health summary with a clinician or coach | 5 | 4 | 4 | 4 | 4 | 3 | inferred | P1 |
| LD-611 | No console for operators, and no webhook management for organizations | 2 | 5 | 1 | 4 | 3 | 3 | verified | P1 |
| LD-612 | No consumer plan, though the financial model depends on one | 2 | 1 | 2 | 1 | 5 | 2 | verified | P1 |
| LD-103 | No vault search at scale | 4 | 1 | 2 | 2 | 2 | 3 | verified | P2 |
| LD-403 | No delegation or household roles | 3 | 3 | 3 | 3 | 3 | 4 | inferred | P2 |
| LD-203 | No provider export adapters | 4 | 2 | 3 | 2 | 3 | 4 | verified | P2 |
| LD-504 | No offer targeting | 2 | 4 | 2 | 2 | 4 | 3 | verified | P2 |
| LD-205 | Provider exports are abandoned partway | 3 | 2 | 2 | 2 | 2 | 3 | inferred | P2 |
| LD-207 | Browsing data cannot be contributed or earned from | 3 | 4 | 3 | 2 | 4 | 4 | inferred | P2 |
| LD-213 | Social and platform data has no route in beyond Google Takeout | 3 | 2 | 2 | 2 | 2 | 3 | inferred | P2 |

Strategic reading: LucidData's problem is not feature count. It is that a new user sees an empty vault, a buyer cannot evaluate supply, and neither can verify the privacy claim. The P0 set fixes exactly that.

Two items deserve emphasis because they attack the same problem from different directions. LD-201 fills the vault, but the user has to wait for value. LD-206 delivers value on day one with an empty vault, by showing the user who is already collecting from them. LD-404 is different again: it is the only feature here that puts the product in front of a stranger who immediately understands why it exists.

### 4.1 Scenario coverage

The gaps above came from two exercises. The first was the competitor and standards research in sections
3 and 8. The second walked 32 personas through end-to-end scenarios against the implementation, marking
each step as covered, planned, or missing. That second pass found failures the feature-level comparison
missed, because they appear between features rather than inside one.

Personas covered individuals with different motivations, professionals presenting credentials, patients,
caregivers, at-risk users, non-technical users, and bereaved families; institutions including issuers,
verifiers, buyers, healthcare, finance, research, government, small business, and enterprise
procurement; and oversight and failure roles including regulators, auditors, attackers, compromised
issuers, insiders, disputing users, and support staff.

Three findings changed the roadmap:

1. **Lifecycle events are unhandled.** The product assumes a living, competent user who never loses a
   credential. Death, incapacity, and total credential loss each end in permanent data loss with no
   defined process. LD-104 and LD-105 address this.
2. **Institutions stall before evaluation.** Every institutional persona failed at procurement rather
   than at a feature, and organizations cannot even add a second team member. LD-107, LD-603, and
   LD-604 address this.
3. **The audit chain protects against outsiders, not the operator.** It is tamper-evident to someone who
   verifies it, but a privileged actor can rewrite the table and recompute hashes. LD-605 addresses this.

One finding was checked and dismissed. Consent revocation is enforced at access time in
[app/api/org/verify-consent/route.ts](../app/api/org/verify-consent/route.ts), which filters on
`revoked` and the end date, so revoked grants do not continue to serve data.

## 5. Feature specs

Each spec is self-contained. Numbering: 1xx trust, 2xx acquisition, 3xx consent and rights, 4xx credentials, 5xx marketplace, 6xx platform.

---

### LD-101 Trust centre and key custody disclosure

Priority: P0. Effort: small. Depends on: none.

Rationale. Meeco publishes ISO 27001 and its crypto design, Optery publishes an architecture page and SOC 2 Type II, and Vana states plainly that control ends once plaintext reaches a grantee. LucidData makes a stronger cryptographic claim than most competitors and publishes no evidence for it. This is the cheapest differentiation available.

Users. Prospective individuals evaluating the privacy claim. Security reviewers at prospective organizations.

Stories.
- As a prospective user, I want to see where encryption happens and who holds each key, so I can judge the claim rather than trust a slogan.
- As an organization security reviewer, I want a threat model and subprocessor list, so I can complete a vendor assessment without a sales call.

Scope. A public `/trust` route. A key-custody table covering the master key, per-entry DEKs, issuer keys, and recovery escrow. A statement of exactly which metadata stays server-visible. A threat model page. A subprocessor list. A vulnerability disclosure contact. A statement that revocation cannot recall data already delivered.

Non-goals. Pursuing certification. Publishing an audit LucidData has not had.

Implementation.
- Add `app/(marketing)/trust/page.tsx` and `app/(marketing)/trust/threat-model/page.tsx` as Server Components.
- Source the custody table from a typed constant in `lib/constants/trust-disclosures.ts` so it cannot drift silently from the code.
- Link from the marketing nav and the footer.

Security. This page must state what is true today. The unencrypted metadata list must match the `vault_data` columns in the current migrations: `label`, `category`, `tags`, `schema_type`. If those change, the constant must change in the same pull request.

Acceptance criteria.
- [ ] `/trust` renders without authentication.
- [ ] The custody table names every key material in `lib/crypto/` and states who holds it and where it is derived.
- [ ] The page states that `label`, `category`, `tags`, and `schema_type` are server-visible and must not hold sensitive content.
- [ ] The page states that revocation does not recall already-delivered copies.
- [ ] Certification status distinguishes achieved from in progress. Do not state a certification and an "underway" claim for the same standard, which is a live error on a competitor's site.
- [ ] A vulnerability disclosure contact is published.
- [ ] Copy passes the humanizer rules in [.github/skills/humanizer/SKILL.md](../.github/skills/humanizer/SKILL.md).

Tests. A Vitest test asserting the custody constant lists every exported key-handling module in `lib/crypto/`. A Playwright test asserting `/trust` is publicly reachable.

Telemetry. Page views, and conversion from `/trust` to registration.

---

### LD-102 Production notification delivery

Priority: P0. Effort: small. Depends on: none.

Rationale. The email transport layer exists in [lib/services/notification-email.service.ts](../lib/services/notification-email.service.ts) but resolves to `none` without configuration, so consent requests, credential requests, security alerts, and payout notices silently fail to reach users. Every organization-to-user workflow depends on this. It is the highest ratio of value to effort in the roadmap.

Stories.
- As a user, I want an email when an organization requests access, so I can respond without checking the app.
- As an organization, I want my request to actually reach the person, so my workflow completes.

Scope. Configure a production transport. Add deep links to `/requests`, `/credentials`, and `/settings`. Add delivery failure logging. Add a send-time check that surfaces a configuration warning in the org portal when the transport is `none`.

Non-goals. A template designer. Marketing email. Per-category preferences beyond the existing flag.

Implementation.
- Set `EMAIL_TRANSPORT` and provider credentials in deployment configuration. Do not commit them.
- Extend `renderNotificationEmail` to include an absolute deep link derived from `deepLinkPathForEntity`.
- Log delivery failures through [lib/services/error-logger.ts](../lib/services/error-logger.ts) without including recipient content.
- Add a banner in the org portal when `resolveTransport()` returns `none`.

Security. Never log the message body, the recipient address, or tokens. Deep links must point at authenticated routes and must not embed a bearer token in the query string.

Acceptance criteria.
- [ ] With a transport configured, a consent request produces an email containing a working deep link.
- [ ] With no transport configured, the in-app notification still succeeds and the failure is logged once.
- [ ] Email respects `email_notifications_enabled`.
- [ ] No recipient address, body, or token appears in logs.
- [ ] Send remains deferred so request latency is unchanged.

Tests. Unit tests for deep link construction per entity type. A test asserting a transport failure does not throw into the caller. A test asserting the disabled preference suppresses send but not the in-app record.

Telemetry. Send attempts, failures by reason, and click-through by entity type.

---

### LD-103 Client-side vault search

Priority: P2. Effort: medium. Depends on: none.

Rationale. Vault content is encrypted, so the server cannot index it. Once connectors fill vaults with hundreds of entries, label-only search stops working.

Scope. An in-browser encrypted index built after unlock, persisted in IndexedDB, and cleared on lock.

Security. The index must never leave the browser and must be cleared when the vault locks. Treat it as plaintext for threat-model purposes.

Acceptance criteria.
- [ ] Search returns results from decrypted content.
- [ ] The index is cleared on lock and on sign-out.
- [ ] No index data is sent to the server.
- [ ] Search stays responsive at 1000 entries.

Tests. A test asserting the index is cleared on lock. A performance test at 1000 entries.

---

### LD-104 Account continuity for death and incapacity

Priority: P1. Effort: large. Depends on: LD-303.

Rationale. The product is called a data bank, and a bank that loses everything when the account holder
dies is not a bank. Verified absent: no beneficiary, legacy contact, or incapacity concept exists
anywhere in the schema or code. Today, when a user dies, their vault becomes permanently unreadable,
including the records their family most needs, such as insurance policies, financial summaries, and
medical history.

This also breaks the caregiver case, which is more common than death. An adult child managing a parent
with dementia has no path at all once the parent can no longer enter their password.

Stories.
- As a user, I want to name someone who can reach my vault if I die, without giving them access now.
- As a family member, I want a defined process rather than a support ticket that cannot be honoured.
- As a user, I want to know exactly what my nominee will and will not see.

Scope. Nominated recipients with a scoped selection of categories. A delayed release triggered by
verified inactivity or an attested claim, with a notification window during which the user can cancel.
Evidence requirements for a claim. Full audit and receipt coverage.

Non-goals. Giving LucidData staff a way to open a vault. The mechanism must be cryptographic, not
administrative, or it becomes a back door that defeats the entire product.

Architecture. Wrap a copy of the relevant data keys to the nominee's public key at nomination time, so
release is a matter of handing over an already-wrapped key rather than decrypting anything server-side.
The nominee needs a LucidData account with their own keypair. The server stores the wrapped key and
releases it only when the trigger conditions are satisfied. It never holds a key that opens the vault
itself.

Trigger options, which must be configurable per user:
- Inactivity for a chosen period, with escalating notification to the user first. Inactivity means no authenticated session for the configured number of consecutive days, read from Supabase auth sessions. Default 180 days, minimum 90. Escalation runs at 50 percent of the period, at 90 percent, and then a mandatory 30 day final window before release.
- A claim supported by evidence, followed by a mandatory 30 day waiting period with notification to the user.

The waiting period is the safety mechanism. It converts a fraudulent claim into something the living
user can see and cancel.

Security.
- A nominee must never gain access before a trigger fires. Test this directly.
- The user must be notified through every channel available at each escalation step, and cancellation must be a single action.
- Claims must be rate limited and audited. A repeated claim against a living user is an attack signal.
- Nomination, change, and revocation each produce a consent receipt under LD-303.
- Scope is per category. A nominee for financial records must not receive health records.

Acceptance criteria.
- [ ] A user can nominate a recipient, choose categories, and choose a trigger.
- [ ] A test attempts to unwrap the stored key with the nominee's key material before any trigger and confirms the unwrap fails. Absence of a plaintext key in the database is not sufficient evidence.
- [ ] Inactivity triggers escalating notification before any release.
- [ ] The user can cancel a pending release in one action during the waiting period.
- [ ] A released nominee sees only the nominated categories.
- [ ] LucidData staff cannot trigger a release, and no service-role path can produce plaintext.
- [ ] Every nomination, trigger, cancellation, and release is audited and produces a receipt.

Tests. A pre-trigger access test proving the nominee cannot read early. A cancellation test. A
scope-limit test. A test that no service-role code path can decrypt nominated data.

Open question. Whether an attested death claim is accepted at all, or whether inactivity is the only
supported trigger, is a policy decision with legal weight. Resolve before implementation.

---

### LD-105 Recovery hardening

Priority: P0. Effort: medium. Depends on: none.

Rationale. Today a user who forgets their password and has not saved a recovery code loses their vault
permanently. Recovery-code escrow exists in [lib/services/account.service.ts](../lib/services/account.service.ts),
but enrollment is optional and easy to skip, so the most common real-world failure is unrecoverable by
design. Zero knowledge is the right architecture, and it makes enrollment quality a safety issue rather
than a preference.

Stories.
- As a user, I want to be stopped from creating a vault I will lose access to.
- As a user, I want more than one way back in.
- As a support agent, I want a defined answer rather than telling someone their records are gone.

Scope. Guided recovery enrollment before a user can store meaningful data. Multiple recovery factors.
Periodic verification that the user still holds a working factor. Explicit, unambiguous copy about what
cannot be recovered.

Applies to new users only. Users who already hold vault data at the time this ships are prompted on
unlock but are never blocked, because retroactively blocking writes on an existing vault would punish
the people the spec is meant to protect.

Implementation.
- Block the first vault write until at least one recovery factor is confirmed, with an explicit informed override for users who genuinely want no recovery path.
- Support more than one factor: a downloaded recovery code, a second device holding a wrapped key, and a nominated recipient under LD-104.
- Prompt periodically to confirm the recovery code is still held, similar to the way passkey re-verification works.

Security.
- Recovery factors wrap the master key. The server must never hold an unwrapped copy.
- An informed override must record that the user was warned, and must not be the default path.
- Recovery use writes a security notification through the existing path in [lib/services/security-notification.service.ts](../lib/services/security-notification.service.ts).

Acceptance criteria.
- [ ] A new user cannot write vault data before confirming a recovery factor or explicitly declining.
- [ ] Declining requires an interaction that states the data will be unrecoverable.
- [ ] At least two independent recovery factors are supported.
- [ ] Recovery code confirmation is prompted periodically.
- [ ] The server holds no unwrapped key at any point, asserted by test.
- [ ] Any recovery event produces a notification and an audit entry.

Tests. A test that the first vault write is blocked without a factor. A wrap and unwrap round trip per
factor. A test asserting no unwrapped key is persisted.

---

### LD-106 Session security and at-risk protections

Priority: P0. Effort: medium. Depends on: none.

Rationale. The master key stays in memory once the vault is unlocked, so anyone with a live session on
an unlocked device has complete access until the browser closes. There is no idle lock, no re-
authentication for destructive actions, and no way to see or end other sessions. For a user escaping
domestic abuse or stalking, where an abuser often has physical device access, that combination is
dangerous rather than merely inconvenient.

Stories.
- As a user, I want my vault to lock itself when I walk away.
- As a user, I want to see every active session and end the ones I do not recognise.
- As an at-risk user, I want destructive actions to require more than a warm session.

Scope. Idle timeout that clears the in-memory key. A session list with device, location, and last seen,
plus remote revocation. Step-up authentication for exporting, revoking consent, changing the password,
adding a recovery factor, nominating a recipient under LD-104, and deleting the account.

Implementation.
- Add an idle timer to the encryption provider in [app/providers.tsx](../app/providers.tsx) that clears the key and requires unlock. Make the period configurable, with a conservative default.
- Build the session list on Supabase session records, and surface it in settings.
- Gate the listed sensitive actions behind a fresh authentication check rather than session presence alone.

Security.
- Clearing must actually drop the key from memory, not just flip a flag that hides the UI.
- Session revocation must invalidate the refresh token server-side, not only locally.
- Step-up must be required per action, not cached for the session, otherwise it provides nothing.

Acceptance criteria.
- [ ] The vault locks after the configured idle period and the key is no longer in memory.
- [ ] A user can list active sessions and revoke any of them.
- [ ] A revoked session cannot refresh and is rejected on its next request.
- [ ] Each sensitive action requires fresh authentication.
- [ ] Every revocation and step-up failure is audited and notified.

Tests. A test asserting the key is unreachable after idle lock. A test that a revoked session fails to
refresh. A test that step-up is not cached across actions.

---

### LD-107 Assurance and procurement pack

Priority: P0. Effort: medium. Depends on: LD-101.

Rationale. Institutional scenarios fail at the same point, and it is earlier than expected. Before any
technical evaluation, procurement asks for a data processing agreement, an uptime and support
commitment, a data residency statement, a disaster recovery position, and evidence of independent
security testing. None of those exist. Every institutional persona stalls here regardless of how good
the product is, which makes this a revenue blocker rather than a documentation task.

LD-101 covers the public trust story for individuals and security reviewers. This spec covers what a
buyer's legal and risk functions require before signing.

Scope. A data processing agreement template. A published support and availability commitment with
defined severity levels and response times. A data residency statement, including where Supabase hosts
data today. A backup, recovery objective, and continuity statement. An incident response and breach
notification process meeting the 72-hour expectation. A published disclosure and independent testing
position. A standard security questionnaire response.

Non-goals. Claiming a certification that has not been obtained. State the current position and any
planned work, and keep achieved and in-progress strictly separate, per the LD-101 criterion.

Implementation.
- Publish under `/trust` alongside LD-101, with downloadable documents.
- Keep the residency statement accurate to the actual deployment rather than aspirational.
- Write the incident response process as an executable runbook, including who declares an incident, how affected users are identified, and the notification templates.

Acceptance criteria.
- [ ] A data processing agreement is available without contacting sales.
- [x] Support severity levels and target response times are published.
- [x] The residency statement names the actual hosting region and any subprocessor locations.
- [x] Recovery objectives are stated and have been tested at least once.
- [x] The incident response runbook names roles and includes breach notification templates.
- [x] Certification status is unambiguous, with achieved and planned clearly separated.
- [x] Business continuity states what happens to user data if the service ends, including the export path.

Tests. A link check in CI so published documents cannot silently disappear. A recovery drill recorded
with its date and outcome.

---

### LD-108 Accessibility conformance

Priority: P1. Effort: medium. Depends on: none.

Rationale. Public sector procurement requires accessibility conformance, and no evidence exists today.
This also affects the individual case directly: the product handles health, financial, and legal records,
which correlate with disability and age, so the users most likely to depend on a data bank are the ones
most likely to be excluded by an inaccessible one.

Scope. WCAG 2.2 AA conformance for the individual and organization surfaces. An accessibility statement.
Automated checks in CI. Keyboard and screen reader coverage of the primary flows.

Implementation.
- Add automated accessibility assertions to the existing Playwright suite in `__tests__/e2e/`, covering registration, unlock, vault create and view, consent grant and revoke, and credential share.
- Fix the known issues already noted in the repository, including select controls without an accessible name.
- Publish a conformance statement with known limitations rather than a blanket claim.

Acceptance criteria.
- [x] Primary flows are operable by keyboard alone.
- [x] Primary flows pass automated accessibility checks in CI, and violations fail the build.
- [x] Form controls have programmatic names, and errors are announced.
- [x] Colour is never the sole carrier of meaning, which matters for consent and verification states.
- [x] An accessibility statement is published with known limitations.

Tests. Automated accessibility assertions per primary flow. A keyboard-only traversal test of the
unlock and consent paths.

---

### LD-109 Platform abuse controls

Priority: P0. Effort: medium. Depends on: none.

Rationale. Three live defects let an anonymous stranger use LucidData against its own users, and all
three are cheap to fix.

First, organization registration is unauthenticated. [app/api/org/register/route.ts](../app/api/org/register/route.ts)
accepts an anonymous POST, creates an organization through the service-role client, and returns a
working API key. The session is read only afterwards, and only to optionally attach an owner. Anyone can
mint an organization called any name and immediately start sending consent and credential requests to
real users. That is a phishing channel with LucidData's branding on it.

Second, `assertIssuanceQuota` in [lib/services/billing.service.ts](../lib/services/billing.service.ts)
is defined and never called anywhere, so plan limits are not enforced on any path.

Third, nothing is rate limited, so all of the above is unlimited.

Stories.
- As a user, I want a request from an organization to mean that organization is real.
- As the operator, I want plan limits to be enforced rather than decorative.

Scope. Require an authenticated session to register an organization. Withhold the API key until domain
verification completes. Require verified status before an organization may contact any user. Wire quota
enforcement into every issuance path. Rate limit registration, consent requests, credential requests,
and verification. Make user-lookup responses identical whether or not the account exists.

Implementation.
- Move organization creation behind an authenticated action, and make the creator an owner in the same transaction rather than as an afterthought.
- Apply the `verified_at` and `org_type` check already present in [app/api/org/credentials/route.ts](../app/api/org/credentials/route.ts) to the consent-request and credential-request routes.
- Call `assertIssuanceQuota` on the API issuance path as well as the portal path.
- Return one status code and one body shape from any endpoint that takes a user email. The existing comment in those routes already claims this behaviour; the code does not implement it.

Security.
- Enumeration responses must be identical in status, body, and timing. A timing difference is still an oracle.
- Rate limits must be keyed on something the attacker cannot trivially rotate, and must be backed by a shared store rather than per-instance memory.
- Unverified organizations must be unable to reach a user at all, not merely flagged in the interface.

Acceptance criteria.
- [ ] Organization registration requires an authenticated session.
- [ ] An API key is not issued until domain verification succeeds.
- [ ] An unverified organization cannot send a consent or credential request.
- [ ] Issuance quota is enforced on every issuance path, asserted by test on the API route.
- [ ] A request for a known and an unknown email returns byte-identical responses, asserted by test.
- [ ] Registration, requests, and verification are rate limited, and the limit is enforced across instances.
- [ ] Pending inbound requests per user per organization are capped.

Tests. An enumeration test comparing responses for existing and non-existing users. A quota bypass test
against the API issuance route. A rate-limit test. A test that an unverified organization is refused.

---

### LD-110 Legal terms and US consumer health privacy

Priority: P0. Effort: small to build, with legal review on the critical path. Depends on: LD-101.

Rationale. The product has no terms of service, no privacy policy, and no processing agreement, which a
search of the repository confirmed on 2026-10-05. Every store listing needs a privacy policy URL: Apple,
Google Play, and all four browser stores. Apple also wants the policy reachable inside the app. With
health and fitness as the focus, US health privacy law applies on top of that. The FTC Health Breach
Notification Rule covers a vendor of personal health records outside HIPAA. Washington's My Health My
Data Act requires consent before collecting or sharing consumer health data, a signed authorization
before any sale, and a separate consumer health data privacy policy linked from the homepage. Nevada
and Connecticut have similar provisions. The trust centre describes what the system does, but it is not
a contract.

Stories.
- As a person storing health records, I want to read what LucidData may and may not do with them before I sign up.
- As an organization, I want terms and a processing agreement I can send to legal without a sales call.
- As the operator, I want to know which version of the terms each person accepted.

Scope. Terms of service, a privacy policy, a consumer health data privacy policy, organization terms
with a data processing agreement, and a cookie statement if a non-essential cookie is ever set.
Versioned acceptance at registration and again after a material change. A breach notification procedure
that meets the FTC rule.

Non-goals. Writing the legal text in code. Counsel drafts and approves it; this spec builds the place it
lives and the record of who agreed to which version.

Implementation.
- Pages under `app/(marketing)/legal/`, public in the middleware allowlist and linked from the footer. The consumer health data privacy policy also gets its own link on the homepage, as the Washington act requires.
- Keep document versions in a typed constant, `lib/constants/legal.ts`, so the version a person accepted can be recorded and compared.
- Record acceptance (document, version, accepted at) with an audit entry, and prompt again when a version changes. A new table needs row level security and a deletion-manifest entry.
- Add the FTC notification steps to the incident runbook in [lib/constants/assurance.ts](../lib/constants/assurance.ts), next to the existing 72-hour Article 33 path.

Security. The acceptance record is evidence. Append to it rather than overwrite it, and state its
retention reason in the deletion manifest.

Acceptance criteria.
- [x] Terms, privacy policy, consumer health data privacy policy, and organization terms are published without authentication.
- [x] The consumer health data privacy policy has its own link on the homepage.
- [x] Registration records the accepted version, and a version change prompts the person again.
- [x] The incident runbook covers FTC notification, including the media notice for a large breach.
- [ ] Counsel has approved the published text, and the approval date is recorded.
- [x] Copy passes the humanizer rules.

Tests. A Playwright check that each legal page is public. A unit test that a stale accepted version
triggers the prompt. A check that the homepage links the health policy.

Progress, 2026-10-08.
- The documents are published under `/legal`: Terms of Service, Privacy Policy, Consumer Health Data Privacy Policy, Organization Terms and Data Processing Agreement, and an account deletion page, which Google Play requires as a public web address. Each document's version is the date it took effect, kept in `lib/constants/legal.ts`. Retention windows, subprocessors, deletion residuals, marketplace fees, and the processing clauses are read from the constants the trust centre already uses, so a document cannot drift from the code. The footer, which is on the homepage, links the health policy, as RCW 19.373.020 requires. The requirements were taken from primary sources: RCW 19.373, NRS 603A, the Connecticut consumer health data provisions, 16 CFR 318 as amended in 2024, CalOPPA, and the Apple, Google Play, Chrome Web Store, and Firefox add-on policies.
- Registration has two boxes. Accepting the terms and the privacy policy is required. Consent to store health data is separate and optional, because Washington's act does not count accepting general terms as consent. With email confirmation on there is no session at sign-up, so the form stores the versions it showed in sign-up metadata and the first sign-in records them, dated to sign-up. A version later than the published one is ignored. The dashboard shows a prompt that blocks use until the current versions are accepted, so a material change reaches everyone, and existing accounts are asked on their next visit.
- Health data needs consent before it is stored, enforced in the vault service for a health category or a health schema type, so no client can skip it. The browser asks at the moment it matters, when a health entry, a health import, or a synced record is refused, and retries once after consent. Connecting a source sends a person without consent to settings first. Withdrawing consent appends a record, refuses new health data, and disconnects every source; entries already stored stay until the person deletes them.
- `legal_acceptances` is append-only for every role and erased with the account. Only an organization owner can accept the organization terms, which registering an organization now requires. Rights requests accept Washington, Nevada, and Connecticut, with 45, 30, and 45 days.
- The incident runbook gains the FTC Health Breach Notification Rule: notice to people within 60 calendar days by email or mail, the FTC alongside it for 500 or more people and in a yearly log below that, media notice for 500 residents of one state, and state breach laws. The notice template carries every element 16 CFR 318.6 lists.
- Writing the privacy policy exposed three inaccuracies, now fixed. The trust centre said four vault columns were readable, but `description`, the expiry date, three provenance columns, and two timestamps are readable too, and the create and edit forms invited free text in `description` without saying so. The list is now derived from the migrations by a test, and the label and description fields say they are not encrypted. The processing terms said EU and UK transfers relied on Standard Contractual Clauses, which do not exist; they now say an organization must contact us first. And the refusal shown when a Global Privacy Control signal blocks a marketplace contribution was a plain error, so production replaced it with framework boilerplate; it is now user-facing.
- One commitment in the health policy is manual for now: when a person asks us to delete health data, we notify each organization they shared it with. The operator does it from `privacy@` until LD-611 gives it a screen.
- Counsel has not reviewed the documents, which keeps one criterion open and should happen before any store submission. A review of a document set like this is a one-time cost above the monthly budget, so it is the owner's decision. Points for counsel: the legal entity and its address, governing law and venue, whether to add arbitration, the 18-and-over age floor, whether marketplace sales of de-identified fields are a sale under the CCPA and the state health laws, and the no-BAA position for organizations.

---

### LD-111 Health-first positioning and accurate claims

Priority: P0. Effort: small. Depends on: LD-110 for the legal links.

Rationale. The homepage leads with "Earn from your data", the individuals page with "Get paid", and the
hero says people "never see a cent" of the data market. Section 7.3 found a realistic contributor earns a
few dollars to thirty dollars a year, and LD-501 left only credential data sellable. The health focus adds
data that must never be sold: `health` is a restricted category here, Apple guideline 5.1.3 forbids it
for HealthKit data, and the Strava and Google terms restrict onward sharing. The pricing table also
labels the business tier "Most popular" with no usage behind the label. LD-101 exists so that the product
makes no claim it cannot back, and Apple guideline 2.3.1 treats misleading marketing as grounds for
removal.

Scope. Rewrite the homepage hero and feature grid, the individuals page, the pricing table, and the
footer tagline around the health vault: data from every device in one encrypted place, shared on the
person's terms. Where the marketplace still appears, describe it as a small optional payment for
credential data, with the amount shown before consent.

Implementation.
- Edit [components/marketing/sections.tsx](../components/marketing/sections.tsx), [app/(marketing)/for-individuals/page.tsx](../app/%28marketing%29/for-individuals/page.tsx), [components/marketing/pricing-table.tsx](../components/marketing/pricing-table.tsx), and [components/marketing/footer.tsx](../components/marketing/footer.tsx).
- Where copy states a number or a promise, keep it in a typed constant so a test can hold it to the model.

Acceptance criteria.
- [x] No consumer-facing page offers income or payment as the reason to sign up.
- [x] No page implies that health data can be sold.
- [x] No tier is labelled "Most popular" until usage supports it.
- [x] Every encryption claim matches the custody table from LD-101.
- [x] Copy passes the humanizer rules, and the marketing e2e specs match the new copy.

Tests. A unit test that scans the marketing components for banned earnings phrases. The existing
marketing and accessibility e2e specs.

Progress, 2026-10-08.
- The homepage, the individuals page, the pricing table, the footer, the business page, the app manifest, and the first-run wizard lead with the health vault. The product is called LucidData everywhere a person sees a name, including the installed app, the dashboard header, the passkey prompt, and the receipt page; "Lucid" on its own is gone.
- The marketplace appears once for individuals, under "What about selling data?", as an optional way to contribute credential data. The fee and the payout threshold on that page are read from `lib/constants/marketplace-economics.ts`, and the page says plainly that we estimate a few dollars a year and that many people will not reach the threshold within a year, as section 7.3 found. The data buyer tier names the categories that are never for sale from the same list the marketplace enforces, the business tier states the free issuance allowance from the plan catalog, and no tier is ranked.
- Every claim was checked against the code before it was written, and four of the first drafts failed. Sharing health records with a coach or a clinic is LD-305 and does not exist yet, so the copy describes the sharing that does: credential links that show chosen fields, expire, and can be revoked, and answering an organization's request. "We store only ciphertext" was untrue, because labels, descriptions, dates, and import sources are readable, so the copy now says what is inside an entry is unreadable and points to the trust centre's list. The threat model listed four readable columns where there are eleven, and did not mention offline password guessing against a copied database; both are corrected, and a test holds the stated PBKDF2 iteration count to the code.
- Checking "No page implies that health data can be sold" found that health data could in fact be sold. The vault offered "Sell your data" toggles on health entries, the contribute dialog listed every entry, and the contribution service checked the pool's category but never the entry's, so a medical record could be contributed to a "personal" pool and released once the cohort met k. The service now refuses any entry whose category or schema type is restricted, judged from the stored entry rather than the request; tracker summaries count as browsing data although they are filed under "other". The vault shows no toggles on restricted entries, the dialog lists only eligible ones, a release and a buyer evaluation both leave out any restricted contribution made earlier, and the per-field opt-in checks that the entry belongs to the person. The database refuses the same contributions on its own in the change that follows this one.
- `lib/constants/__tests__/positioning.test.ts` scans every public page, the root layout, the manifest, and the wizard for earnings language, ranking labels, dashes, curly quotes, and the old name, and was checked by planting a violation.
- Two gaps stay with other specs. The dashboard is still built around the marketplace, with a revenue card and "Sell your data" as its main action; LD-214 replaces it with the health timeline. The Apple Health import keeps workouts or daily totals, not both, and stops at 1,000 records, which LD-210 fixes.

---

### LD-112 Passkey vault unlock and reload-safe sessions

Priority: P1. Effort: medium. Depends on: LD-105 for the factor model.

Rationale. A passkey signs a person in, and then
[components/auth/vault-unlock-dialog.tsx](../components/auth/vault-unlock-dialog.tsx) asks for the
password anyway, because the master key is derived from it. The key also lives only in memory, so every
hard reload locks the vault. A person checking a daily health view meets both on every visit. The
WebAuthn PRF extension lets a passkey produce a stable secret on supporting authenticators. That secret
can wrap a copy of the master key in the same way the LD-105 recovery factors do.

Scope. A passkey PRF factor that unwraps the master key at sign-in. The password path where PRF is not
supported. An evaluation of a reload-safe session key, with its trade-off disclosed before it ships.

Non-goals. Replacing the password as the root secret. Changing the PBKDF2 parameters.

Implementation.
- Add a `passkey_prf` type to `recovery_factors`, bound to a credential id, rather than creating a parallel table.
- Request the PRF extension at passkey registration and sign-in, derive a wrapping key from the PRF output with HKDF, and wrap and unwrap the master key in the browser.
- For reloads, evaluate a non-extractable AES-KW key kept in IndexedDB for the session and cleared by idle lock, sign-out, and session revocation. Ship it only with a trust centre entry that says what an attacker with script execution could do.

Security.
- The server stores the wrapped key and the credential id. It never sees PRF output.
- Removing a passkey removes its factor in the same transaction.
- Follow [lib/crypto/AGENTS.md](../lib/crypto/AGENTS.md): known-answer vectors, round trips, a wrong-key failure, and a key-custody entry, which the trust-disclosure test enforces.

Acceptance criteria.
- [ ] On an authenticator with PRF support, passkey sign-in opens the vault without the password.
- [ ] Without PRF support, the password path works unchanged.
- [ ] A wrong PRF output fails to unwrap, asserted by test.
- [ ] Deleting a passkey deletes its factor.
- [ ] The trust centre lists the new factor and any session key.

Tests. A wrap and unwrap round trip with a fixed PRF vector. A wrong-secret failure. A test that factor
removal follows passkey removal.

---

### LD-201 Connector framework with zero-knowledge ingestion

Priority: P0. Effort: large. Depends on: LD-102 for failure notices.

Rationale. This is the adoption gap. Cozy has a connector catalog, Plaid and Terra have made embedded connection flows the expected pattern, and Gener8 and Reklaim win users purely on easy acquisition. LucidData currently requires manual entry or file import, so a new vault is empty and stays empty. [packages/core/src/connectors/fitness.ts](../packages/core/src/connectors/fitness.ts) has normalization functions and OAuth metadata for Strava and Fitbit but no callback routes, no token storage, and no sync. The design already exists in [docs/vault-data-ingestion.md](vault-data-ingestion.md).

The hard constraint: a background sync worker runs without the user present, so it cannot have the master key. It must write ciphertext it cannot read.

Stories.
- As a user, I want to connect a provider account, so my vault fills without manual entry.
- As a user, I want the sync worker to be unable to read what it writes, so the privacy claim survives automation.
- As a user, I want to disconnect a source and choose whether to keep already-imported data.

Scope. A per-user ingestion keypair. A `data_sources` table with encrypted provider tokens. OAuth authorize and callback routes. A sync job writing sealed payloads. A client-side unseal step. Connect and disconnect UI. Strava and Fitbit as the first two providers.

Non-goals. Financial connectors, which stay feature-flagged while CFPB 1033 is stayed. Health connectors, which are LD-203. Native mobile background sync.

Architecture. Sealed-box ingestion:

1. At registration, or at first connect for existing users, the browser generates an X25519 keypair. The public key goes to `users.ingest_public_key`. The private key is wrapped with the master key and stored as `users.wrapped_ingest_private_key`.
2. The sync worker fetches provider data, normalizes it with the existing pure functions, and seals the payload to the user's public key. It writes to a `pending_ingest` table. It never holds a key that can open the result.
3. On next unlock, the browser unwraps the ingestion private key, opens each sealed payload, re-encrypts it under the standard vault envelope, writes it through the existing vault path, and deletes the pending row.

This preserves the invariant that the server never holds plaintext or a key that yields plaintext.

Data changes. New migration `<timestamp>_connector_ingestion.sql`:
- `users.ingest_public_key text`, `users.wrapped_ingest_private_key text`, `users.ingest_key_salt text`, all nullable for existing users.
- `data_sources`: `id`, `user_id`, `provider`, `status` in `connected|error|disconnected`, `scopes text[]`, `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at`, `last_synced_at`, `last_error`, `created_at`. Enable row level security with `(SELECT auth.uid()) = user_id` policies for select, update, and delete. Writes come from the service role.
- `pending_ingest`: `id`, `user_id`, `data_source_id`, `sealed_payload text`, `schema_type`, `provider_record_id`, `created_at`. Same policy shape. Unique on `(data_source_id, provider_record_id)` for idempotency.

Provider tokens are encrypted at rest with a server-held key from `CONNECTOR_TOKEN_SECRET`, mirroring the `ISSUER_KEY_SECRET` pattern in [lib/crypto/credential-signing.ts](../lib/crypto/credential-signing.ts). This is a deliberate, disclosed exception: the worker must be able to call the provider. Provider tokens are not vault data, and the trust page from LD-101 must say so.

Implementation.
- `packages/core/src/crypto/ingestion-keys.ts`: keypair generation, wrap, unwrap, seal, open. Browser only.
- `lib/repositories/data-source.repository.ts` and `lib/repositories/pending-ingest.repository.ts`.
- `lib/services/connector.service.ts`: connect, disconnect, refresh, sync, with audit entries for each.
- `app/api/connectors/[provider]/authorize/route.ts` and `.../callback/route.ts`. Use a signed state parameter bound to the session.
- `lib/actions/connector.actions.ts` for portal operations.
- `components/settings/connected-sources.tsx` for the connect and disconnect UI.
- A drain step in [app/providers.tsx](../app/providers.tsx) or the vault page that processes `pending_ingest` after unlock.

Security.
- The OAuth `state` must be signed and single-use. Reject callbacks with a missing, reused, or unbound state.
- Never log tokens, sealed payloads, or provider responses.
- Disconnect must revoke the token with the provider where supported, then delete the stored tokens.
- Sealed payloads must be unreadable by the service role. Add a test proving the service-role client cannot derive plaintext.

Acceptance criteria.
- [ ] Connecting Strava stores a `data_sources` row with encrypted tokens and no plaintext token in logs.
- [ ] A sync run writes `pending_ingest` rows and no readable plaintext exists server-side.
- [ ] After unlock, pending rows become vault entries and are deleted.
- [ ] Re-running a sync creates no duplicates.
- [ ] Disconnect revokes upstream where supported and removes stored tokens.
- [ ] The user chooses whether disconnect deletes already-imported entries.
- [ ] Every connect, sync, error, and disconnect writes an audit entry.
- [ ] Token refresh occurs before expiry and a failed refresh sets `status = 'error'` with a user-visible message.

Tests. Round-trip unit tests for seal and open. A test that a wrong key fails to open. Idempotency tests on repeated sync. A rejected-state callback test. A test asserting an expired token triggers refresh. An end-to-end test with a mocked provider covering connect, sync, unlock, drain, and disconnect.

Telemetry. Connect starts and completions, time to first imported record, sync success rate by provider, refresh failures, disconnect reasons.

Rollout. Ship behind a feature flag. Strava first, Fitbit second. Note that the Fitbit Web API is deprecating in September 2026 in favour of the Google Health API, so treat the Fitbit adapter as short-lived and keep the provider interface stable.

**Updated 2026-10-05:** the Fitbit connector is retired. Google turns the Fitbit Web API off on 30 October 2026. See [section 6.14](#614-re-sequencing-for-the-health-and-fitness-focus).

Provider expansion, decided 2026-07-26. The connector framework only fits providers that expose a
server-to-server API, because the sync worker runs while the person is away. That set is: Garmin
(Health API, partner approval required), Withings, Oura, Polar, Whoop, Suunto, and Wahoo. Each is a
`ConnectorDef` entry plus a normalizer, so the marginal cost per provider is small now the framework
exists. Confirm each provider's current terms before registering, particularly any restriction on
onward transfer.

Samsung Health, Xiaomi, and anything reaching the phone through Health Connect are **not** candidates
here. They have no web API and belong to LD-204 stage B. Aggregators such as Terra, Rook, and Vital
would collapse many providers into one integration, but they would hold provider tokens between the
person and the provider, which makes them a disclosed subprocessor on the LD-101 trust centre. That
is a deliberate trade rather than a shortcut, and it has not been taken.

---

### LD-202 Source health and field provenance

Priority: P1. Effort: medium. Depends on: LD-201.

Rationale. Apple Health shows per-record provenance and deterministic source priority. Android Health Connect states plainly that connected services keep their own copies. Terra treats sync state as a product surface. Once data arrives automatically, users need to know where each value came from, how fresh it is, and whether a sync is silently broken.

Stories.
- As a user, I want to see the last successful sync and any error, so I can trust the data is current.
- As a user, I want to know which source produced a value, so I can resolve conflicts.
- As a user, I want to know that a recipient still holds a copy after I revoke.

Scope. A connected sources panel showing status, last sync, backfill range, and a reconnect action. Provenance metadata on imported entries. A retained-copy statement on the consent and sharing surfaces.

Implementation.
- Extend the vault entry metadata with `source_provider`, `source_record_id`, and `source_captured_at`. These are unencrypted metadata, so they must not carry content.
- Add `components/settings/source-health.tsx`.
- Add a provenance line to [components/vault/vault-view-dialog.tsx](../components/vault/vault-view-dialog.tsx).
- Add retained-copy copy to the consent revoke dialog.

Acceptance criteria.
- [x] Each connected source shows status, last successful sync, and last error.
- [x] A broken source is visually distinct and offers reconnect.
- [x] Imported entries display their provider and capture time.
- [x] Revoking consent states that already-delivered copies are not recalled.
- [x] Provenance fields never contain record content.

Tests. Unit tests for freshness formatting. A test that provenance fields reject content-bearing values. A component test for the error state.

---

### LD-203 Provider export adapters

Priority: P2. Effort: medium. Depends on: LD-201 for the normalization interface.

Rationale. OAuth connectors cover a narrow set of providers. Bulk exports cover the long tail without API agreements, and Cozy's connector catalog shows that breadth of acquisition drives retention. This also unblocks health data before any FHIR work.

Scope. Adapters for Google Takeout, Apple Health export XML, and a generic bank CSV. All parsing in the browser, reusing the existing import pipeline.

Implementation. Add `packages/core/src/vault/adapters/` with one pure module per provider exposing `detect(file)` and `parse(file)` returning the same shape [packages/core/src/vault/import-parsers.ts](../packages/core/src/vault/import-parsers.ts) already produces. Extend [components/vault/vault-import-dialog.tsx](../components/vault/vault-import-dialog.tsx) to auto-detect and preview.

Acceptance criteria.
- [x] Each adapter parses a fixture export and produces typed entries.
- [x] Parsing happens entirely in the browser.
- [x] Files larger than the current 1000-record cap stream or chunk rather than failing.
- [x] Unrecognized files fall back to the existing mapping wizard.

Tests. Fixture-based unit tests per adapter, including a malformed file and a very large file.

---

### LD-204 Mobile application

Priority: P0, raised from P1 on 2026-10-05. Effort: large. Depends on: stage A none, stage B requires LD-201.

Rationale. The app earns its place twice, for reasons that are independent of each other.

First, acquisition. Apple HealthKit and Android Health Connect have no web API, so the data behind them
is permanently unreachable from a browser. LucidData already defines `fitness_activity` and
`fitness_daily` schema types in [packages/core/src/schemas/vault-schemas.ts](../packages/core/src/schemas/vault-schemas.ts) with no
automated way to fill them. Native is the only path, not the convenient one.

Second, presentation. Credentials are checked in person, in the moment, by someone who may have no
account and no connection. That is LD-404, and it is the use case most likely to spread the product by
itself, because the person checking a credential sees the value before they are ever asked to sign up.

A third benefit is cryptographic. The web vault holds the master key in memory only, so it locks on
hard refresh. Secure Enclave and Android Keystore hold wrapped key material properly and support
biometric unlock, which removes that friction without weakening custody.

Staging. These ship in two independent stages, and the order matters:

| Stage | Contents | Blocked by |
|---|---|---|
| A | App shell, key handling, biometric unlock, vault view, credential holding and presentation via LD-404 | Nothing. Credentials are already signed and stored |
| B | HealthKit and Health Connect capture | LD-201, for the ingestion keypair and sealed-box pipeline |

Stage A does not depend on the connector work, so it can ship well before stage B. Building stage B
first would duplicate ingestion logic that LD-201 is already creating.

**Decision, 2026-07-26: stage B targets Health Connect, not individual vendors.** This was checked
rather than assumed, and the finding is firmer than expected.

- **Samsung Health has no server-to-server API.** The only official third-party access is the Samsung Health Data SDK, which Samsung documents as an Android SDK requiring the Samsung Health app 6.30.2 or later on Android 10 or later, with no emulator support. It reads the on-device store. There is nothing for a web connector to call.
- **Xiaomi is the same shape.** Its wearables sync into Mi Fitness, with older bands on Zepp Life, and no general public developer API was found.
- **Google Fit cannot be used at all.** Google deprecated the Fit APIs including the REST API, and closed new developer signups on 1 May 2024. It is not a fallback.

Health Connect is the Android system-level aggregation point and the migration target Google names
for Fit. Samsung Health, Mi Fitness, and many other apps write into it. That makes one integration
inside the app worth more than a queue of per-vendor OAuth applications, and it is the reason stage B
is scoped to Health Connect and HealthKit rather than to named brands.

The practical consequence for sequencing: every Android-side wearable is blocked behind LD-204 stage
B. Anyone asking why Samsung or Xiaomi is missing should be pointed here rather than at LD-201.

**Decision, 2026-10-05: stages A and B ship together, built with Expo.** With health and fitness as
the focus, capture is the reason to install the app, so stage B is no longer a follow-up and the
priority moves to P0. The app uses Expo and React Native and installs `react-native-quick-crypto` as
`globalThis.crypto`. The pinned known-answer vectors decide whether the portable crypto core really does
run unchanged on it. The app imports shared code from LD-609 and calls the LD-608 API. Its scope widens
to the vault, the LD-214 timeline, LD-305 sharing, sources, notifications, and settings, including
in-app account deletion, which Apple requires. The marketplace, payouts, and the organization portal
stay out of the binary. Background capture while the vault is
locked seals each record to the ingestion public key with the LD-201 sealed box and uploads it to
`pending_ingest`, so the drain after unlock is the same path the server connectors use. Apple expects a
health app to come from a legal entity rather than an individual, so the developer account must be an
organization account. The Android build needs Google Play's Health Connect permission declaration.

Stories.
- As a user, I want my health data to arrive automatically, because re-entering it by hand is not realistic.
- As a tradesperson, I want to show a customer that my licence and insurance are current.
- As a user, I want biometric unlock, so I am not retyping a long password.
- As a user, I want the same vault on web and mobile, not two disconnected stores.

Scope. Stage A: app shell, platform-backed key storage, biometric unlock, vault browse and view, and the
LD-404 presentation surface. Stage B: read from HealthKit and Health Connect under per-category
permission, encrypting on device through the LD-201 envelope, plus source management and disconnect.

Non-goals. Porting the marketplace, organization portal, credential issuance, or admin surfaces. Those
stay on the web. Do not rebuild the whole product.

Implementation.
- One codebase targeting both platforms. React Native keeps TypeScript and the existing validation and normalization modules reusable.
- Reuse `packages/core/src/schemas/`, `packages/core/src/validations/`, and the connector normalization functions unchanged.
- Derive the master key with identical PBKDF2 parameters and the same `users.key_salt`, so one vault opens on both surfaces.

Security.
- Wrapped key material goes in Secure Enclave or Keystore. Never in plain preferences, and never synced to a platform cloud backup.
- Biometric unlock releases the wrapped key. It does not replace the password as the root secret, so a stolen unlocked device does not yield the master key on another device.
- Health data is sensitive. It must be encrypted before it reaches storage, and must not appear in crash reports, analytics, or logs.
- Request the narrowest permission set, and re-request rather than caching a broad grant.
- Request no reproductive or menstrual data types. See the 2026-10-08 decision in section 8.1.

Acceptance criteria.
- [ ] A vault created on web opens on mobile with the same password, and the reverse.
- [ ] Stage A ships and functions with no dependency on LD-201.
- [ ] HealthKit and Health Connect records import as typed vault entries.
- [ ] Data is encrypted on device before persistence, and no plaintext leaves the device.
- [ ] Biometric unlock never persists an unwrapped key.
- [ ] Key material is excluded from platform cloud backups.
- [ ] Permissions are per category and revocable in app.
- [ ] Crash and analytics payloads contain no health content.
- [ ] Repeated sync produces no duplicate entries.

Tests. A cross-surface test proving web and mobile derive the same key from the same password and salt.
An idempotency test on repeated health sync. A test asserting no health field reaches the crash reporter.

Rollout. Ship stage A first. Treat app store review as a schedule risk, and confirm the marketplace and
payout surfaces stay out of the binary so store payment rules do not apply to the app.

---

### LD-205 Browser extension foundation and import assistant

Priority: P2. Effort: medium. Depends on: foundation none, import walkthroughs require LD-203.

Rationale. Provider exports are the widest acquisition path that needs no API agreement, but requesting
a Google Takeout or bank export is a multi-step flow across several pages and users abandon it. An
extension can guide the request, detect the finished download, and hand the file to the existing
browser-side import pipeline.

This spec also establishes the permission model that LD-206 and LD-207 build on. The extension has
three capability tiers, each a separate and independently revocable consent:

| Tier | Capability | Granted |
|---|---|---|
| 0 | Import assistance, this spec | At install |
| 1 | Local tracker and collection insight, LD-206 | Separate opt-in |
| 2 | Contribute sanitized browsing to pools, LD-207 | Separate opt-in, never bundled with tier 1 |

The mechanism matters more than the promise. Tier 1 and tier 2 permissions live in
`optional_permissions`, so installing the extension does not grant browsing access. The browser's own
permission prompt becomes the enforcement point, which a skeptical user can verify without trusting
LucidData's copy.

Stories.
- As a user, I want help completing a provider export, because the steps are buried and slow.
- As a user, I want installing the extension to grant nothing beyond what I asked for.

Scope. Guided walkthroughs for the LD-203 providers. Detection of a completed export file. Handoff into
[components/vault/vault-import-dialog.tsx](../components/vault/vault-import-dialog.tsx). The tiered
permission scaffold and a consent surface showing which tiers are active.

Non-goals. Any browsing observation in this spec. Ad or tracker blocking, which is LD-206 territory and
deliberately limited to reporting rather than blocking.

Security.
- Install requests `activeTab` plus host permissions for the specific export domains only.
- Tier 1 and tier 2 permissions must be declared optional and requested at the moment of enablement.
- Revoking a tier must drop the underlying browser permission, not just set a flag.
- Parsing happens in the existing browser pipeline, so the extension never uploads a file.
- Publish the permission list, each tier, and the reason for each on the LD-101 trust page.

Acceptance criteria.
- [x] A fresh install holds no permission that permits reading general browsing activity.
- [x] Enabling a tier triggers a browser permission prompt, and declining leaves the tier off.
- [x] Revoking a tier removes the browser permission, verified by querying the permission state.
- [x] Walkthroughs complete an export request for each supported provider.
- [x] A completed export reaches the import flow without a server round trip.
- [x] Uninstalling leaves no residual permission or stored data.

Tests. A manifest test pinning the install-time permission set, so a future change cannot silently
widen it. A test asserting tier revocation actually drops the permission. Integration tests per provider
walkthrough.

---

### LD-206 Tracker transparency and browsing insight

Priority: P1. Effort: medium. Depends on: LD-205.

Rationale. This is the strongest acquisition hook in the roadmap, and it works on day one with an empty
vault. Every other answer to the cold-start problem requires the user to supply data first. This one
gives value before they contribute anything, which is the Optery free-scan pattern applied to tracking
rather than data brokers.

It also resolves the tension in collecting browsing data. Ghostery and Privacy Badger show trackers but
own nothing on the user's behalf. Optery and Incogni show broker exposure but cannot act on live
browsing. Reklaim shows a footprint while separately licensing user data. LucidData can close a loop
none of them close: see who is collecting from you, see what they hold, file a rights request through
LD-301, and only then decide whether to earn from it through LD-207.

That ordering is the product position. The extension's first job is telling the user who is watching
them. Monetization is a later, separate choice.

Stories.
- As a user, I want to see which companies collect data as I browse, so the abstract becomes concrete.
- As a user, I want to know what a site collects before I use it.
- As a user, I want to act on what I find, not just read a report.

Scope. Local detection of trackers, third-party requests, cookies, and fingerprinting signals. A
per-site collection profile. Trends over time. A summary surfaced in the dashboard. Direct handoff into
an LD-301 rights request against an identified collector.

Non-goals. Blocking. Blocking creates site breakage, a support burden, and an arms race, and users who
want it already run something. Report, then let the user act.

Implementation.
- Analysis runs in the extension against a tracker classification list. Nothing is uploaded to perform it.
- Persist findings locally. If the user wants them in the vault, write them through the standard encrypted envelope as a `browsing_insight` schema type.
- Surface aggregate counts in the dashboard, sourced from the vault rather than from a server-side profile.
- Where a collector is identifiable and covered by a privacy law, offer a prefilled rights case.

Security.
- Analysis is local by default. No URL, domain, or page title leaves the device unless the user enables LD-207.
- Sensitive categories, meaning health, finance, legal, adult, and government, are excluded from any persisted record by default, because the domain alone can disclose a condition or circumstance.
- Never persist query strings, fragments, or path segments that may carry tokens or identifiers. Store the registrable domain only.
- The extension must send Global Privacy Control, tying this to LD-302. Reporting trackers while not signalling an opt-out would be incoherent.

Acceptance criteria.
- [x] Tracker detection runs entirely on device and issues no network request to perform analysis.
- [x] The user sees per-site and aggregate collection reporting within one browsing session.
- [x] Sensitive-category domains are excluded from persisted records by default and this is stated in the UI.
- [x] Only registrable domains are stored. A test asserts no query string, fragment, or path is persisted.
- [x] Findings written to the vault use the standard encrypted envelope.
- [x] The extension sends Global Privacy Control on supported requests.
- [x] A detected collector can be escalated into an LD-301 rights case with one action.

Tests. A network-silence test proving analysis performs no outbound request. A URL sanitization test
over adversarial URLs containing tokens, emails, and session identifiers. A sensitive-category exclusion
test. A detection-accuracy test against a fixture page with known trackers.

Telemetry. Installs, tier 1 enablement rate, rights cases opened from a detection, and retention of
users who arrived through the extension against those who did not.

---

### LD-207 Opt-in browsing contribution

Priority: P2. Effort: large. Depends on: LD-206, LD-501, LD-303.

Rationale. Browsing and intent data is the most commercially valuable category in this market and the
reason Gener8 and Reklaim can pay users at all. Making it available on LucidData's terms, with a
disclosed price and a real anonymity guarantee, is the version of that trade that the category currently
lacks.

The risk is proportional. Browsing histories are among the most re-identifiable data that exists.
Published research has repeatedly shown that a small number of visited domains can single out an
individual. Treat this as the highest-risk contribution path in the product, not as another schema type.

Stories.
- As a user, I want to earn from my browsing data if I choose to, with the amount shown before I agree.
- As a user, I want categories I consider private excluded permanently.
- As a buyer, I want intent data that is lawfully sourced and genuinely anonymized.

Scope. A separate opt-in on top of LD-206. Category-level inclusion chosen by the user. Aggressive
sanitization and generalization before contribution. Pricing shown before consent. A consent receipt
through LD-303.

Non-goals. Contributing raw URL histories in any form. Contributing anything from a sensitive category,
even with consent, because the harm from re-identification is not the user's alone to accept when it
reveals a health or legal circumstance.

Security.
- Contribute only generalized features, meaning category-level interest signals and visit-frequency
  bands, never URLs, domains, sequences, or timestamps at full precision.
- Sensitive categories are excluded structurally, not by preference. The code path must make them
  unreachable.
- Every release passes the LD-501 k-anonymity gate. Given the re-identification risk, browsing pools
  require k of at least 100, and the value must not be configurable below 50 for any browsing category.
- Sequence and timing data must be dropped. Ordered browsing is close to a fingerprint even after
  domain removal.
- Users with a universal opt-out signal from LD-302 must not be offered this path at all.

Acceptance criteria.
- [ ] Contribution requires an explicit opt-in distinct from LD-206 enablement.
- [ ] The expected payment or formula is shown before consent, with no prize-draw substitution.
- [ ] No URL, domain, or full-precision timestamp appears in any contributed record, asserted by test.
- [ ] Sensitive categories are unreachable in the contribution path, asserted by test rather than configuration.
- [ ] Browsing pools enforce a higher k than the default and cannot be lowered below it.
- [ ] A user with a universal opt-out signal is not offered contribution.
- [ ] Withdrawal stops inclusion in future releases and produces a revocation receipt.
- [ ] A re-identification test on a crafted dataset fails the release rather than shipping it.

Tests. An adversarial re-identification test treating contributed output as an attacker would. A
structural test that sensitive categories cannot be reached. A sanitization test over hostile URLs. A
test that opt-out state suppresses the offer.

Rollout. Ship after LD-206 has been live long enough to show that users understand what is collected.
Do not launch both at once, because bundling them recreates the model this product exists to replace.

---

### LD-208 Connector framework v2

Priority: P0. Effort: medium. Depends on: LD-201, LD-601.

Rationale. LD-201 proved the sealed-box pipeline, but its shape does not scale past a few providers.
`fetchRecords` in [lib/services/connector.service.ts](../lib/services/connector.service.ts) branches per
provider. Strava returns the latest 30 activities and nothing older. There is no backfill window, no
cursor, no rate-limit handling, and no way to receive the push notifications that Garmin, Oura,
Withings, and Whoop use. The only cadence is the daily cron that the Vercel Hobby plan allows. Provider
terms also differ in ways the code must enforce: Strava's API agreement lets a person's data be shown
only to that person and shared only with their explicit consent, and Google restricts onward use of
health data. Fitbit was retired on 2026-10-05 because Google is turning its Web API off. Providers can
disappear, and the framework needs a clean way to say so.

Scope. A provider module interface and registry. PKCE where the provider supports it. Cursors and a
backfill range. Signed webhook ingestion. Per-source scheduling. A terms policy per provider that the
consent and contribution paths enforce. Retirement as a first-class state.

Implementation.
- One module per provider under `packages/core/src/connectors/providers/`. Each exports its definition, authorize and token exchange, refresh, revoke, a paged fetch that takes a cursor and a start date, a normalizer, an optional webhook verifier, and a `termsPolicy` covering onward transfer, display to others, and AI use.
- Add `sync_cursor`, `backfill_from`, `next_sync_at`, and `rate_limited_until` to `data_sources`. The table's existing row level security and deletion-manifest entry already cover the new columns.
- `app/api/connectors/[provider]/webhook/route.ts` verifies the provider signature, never logs the body, and schedules a sync of that one source.
- Run the cron hourly once LD-610 moves hosting off Hobby, and let `next_sync_at` decide which sources are due.
- Keep the `retired` flag from the Fitbit change: a retired provider is never offered, a grant cannot complete, and an existing source stops syncing with the reason shown.
- Remember which synced records a person deleted, so a later sync does not bring them back. Today the worker skips a record the vault already holds, but a deleted one looks the same as one that never arrived, and Strava's 30 latest activities are fetched on every run. A cursor ends the refetching; a record of deletions, holding only the provider and its record id, covers a backfill.
- Let a person replace an ingestion key that no master key opens any more. A password change before 2026-10-08 did not re-wrap it, so on those accounts every sealed record is unreadable and a new key cannot be published over the old one. Replacing it discards the records sealed to the old key, says how many, and needs a step-up grant.

Security.
- Webhook routes have to be public, so they verify signatures and fail closed.
- A provider whose terms forbid onward transfer can never reach a marketplace pool or an organization grant. Assert this in code, not configuration.

Acceptance criteria.
- [ ] Strava runs through the new interface with no change in behaviour, proven by the existing tests.
- [ ] A first sync backfills to `backfill_from`, and later syncs fetch only new records.
- [ ] A rate-limit response defers the source rather than marking it broken.
- [ ] A webhook with a bad signature is refused and stores nothing.
- [ ] Records from a provider whose terms forbid onward transfer cannot be contributed or granted.
- [ ] Adding a provider needs no edit outside its own module and the registry.
- [ ] An account whose ingestion key no master key opens can replace it, after a step-up, and is told how many sealed records that discards.
- [ ] A synced record the person deleted does not come back on a later sync.

Tests. Recorded fixtures per provider. Cursor idempotency. Signature rejection. A test that every
provider module declares a terms policy.

---

### LD-209 Health schema expansion

Priority: P0. Effort: small. Depends on: LD-501 for the classification rules.

Rationale. The vault knows two fitness shapes, `fitness_activity` and `fitness_daily`, in
[packages/core/src/schemas/vault-schemas.ts](../packages/core/src/schemas/vault-schemas.ts). HealthKit, Health Connect, and the
wearable APIs also deliver sleep, heart rate variability, blood oxygen, body measurements, and
nutrition. Today those could only land in `custom`, which loses their structure.

Scope. Add `sleep_session`, `vitals_daily`, `body_measurement`, and `nutrition_daily`, all in the
`health` category, with form fields and a classification for every field.

Non-goals. Raw sample streams. Store daily aggregates and sessions, the way the platforms' own
statistics APIs return them, so a year of data stays in the thousands of entries rather than the
millions. Reproductive and menstrual data, which waits on open decision 12.

Implementation.
- Zod schemas, `VAULT_SCHEMA_TYPES` entries, and `SCHEMA_FORM_FIELDS` for each type.
- A classification for every field in [packages/core/src/privacy/quasi-identifiers.ts](../packages/core/src/privacy/quasi-identifiers.ts). The build fails without one.

Acceptance criteria.
- [x] Each new type accepts a realistic record and rejects a malformed one.
- [x] Every field is classified, enforced by the existing test.
- [x] The types sit in the restricted `health` category and cannot enter a pool.
- [x] Manual entry works for each type through the schema form.

Tests. Schema round trips, the existing classification test, and a test that the category is restricted.

Progress, 2026-10-08.
- `sleep_session`, `vitals_daily`, `body_measurement`, and `nutrition_daily` are in the registry, all filed under health, with form fields and a classification for every field. Each schema has bounds that no body falls outside, such as blood oxygen above 100 percent or a resting heart rate of 5, which is how a unit mix-up shows itself. A day record needs at least one reading, a sleep session has to end after it starts and last a day at most, and systolic pressure has to be the higher of the two.
- Nothing enforced the schemas before this. `SCHEMA_VALIDATORS` existed but had no caller, so a typed entry could hold anything, and the server cannot check what it cannot read. [validate.ts](../packages/core/src/schemas/validate.ts) now checks every typed record in the browser before it is encrypted. The create form puts each message under its own field and links it for screen readers, the edit dialog names the field in its JSON editor, and an import skips rows that do not fit and says how many it skipped and why.
- The check only reads. What is saved is what the person entered, never the schema's parsed copy, which would fill in defaults nobody chose, such as a past job saved as a current one, and drop any field the schema does not name. Entries saved before the checks existed stay editable: renaming or re-tagging one does not re-check data the edit leaves alone, and a null counts as a field left out, which is how the extension records a summary that saw no collector. An independent review found all three problems before merge.
- `20261008170000_health_schema_types.sql` adds the four types to the database's sale restriction and to its health consent check, so writing a row directly skips neither. A pgTAP test covers both, and the parity test now fails if the database misses any type the registry files under health.
- Sleep needed a date and time input, which the schema form now has. Every schema label and form label is in sentence case, and ranges such as income bands use "to" instead of a dash.
- Two form problems turned up on the way and are fixed. The create and edit dialogs collected a "Data Type" that was never sent or stored, and a screen reader announced it with the same name as the type selector. The edit dialog also offered the type as free text, which the client API has never allowed to change, so it now shows the type the entry was created with.
- Reproductive and menstrual data are left out, which closes open decision 12. See section 8.1.

---

### LD-210 Archive import and health export adapters

Priority: P0. Effort: medium. Depends on: LD-203, LD-209.

Rationale. The exports people already have come as zip files: Apple Health's `export.zip`, Google
Takeout (which now holds Fitbit data), Garmin, Strava's bulk export, and Samsung Health. The importer
reads one unzipped file at a time and stops at 1,000 records, so the person has to unzip by hand and pick
a single file. Until the mobile app ships, these files are the only route for Apple Health and Fitbit
history. After it ships, they are still the fastest way to bring in years of history at once.

Scope. Streaming unzip in the browser. Batched import past the 1,000-record cap, with progress and
resume. Adapters for Fitbit data in Takeout, Garmin, the Strava bulk export, Samsung Health, and Oura,
each mapped to the LD-209 types.

Implementation.
- Add a small, audited zip reader that streams entries rather than loading the archive into memory.
- Extend [packages/core/src/vault/adapters/index.ts](../packages/core/src/vault/adapters/index.ts) with one module per export, each with `detect` and `parse`, as LD-203 established.
- Write in batches through the vault path, deduplicating on `source_record_id` so a re-import adds nothing.
- Add a walkthrough per source to [extension/src/sources.js](../extension/src/sources.js). The existing test checks that each one names its adapter.

Security. Parsing stays in the browser. Treat archive paths as untrusted: reject absolute paths and `..`
segments, and cap the total uncompressed size so a zip bomb cannot exhaust memory.

Acceptance criteria.
- [ ] An Apple Health `export.zip` imports without manual unzipping.
- [ ] An import of more than 1,000 records completes in batches and can resume.
- [ ] Re-importing the same archive creates no duplicates.
- [ ] Each new adapter parses a fixture into typed entries.
- [ ] A zip bomb and a path-traversal entry are refused.

Tests. A fixture archive per adapter, a duplicate import, an oversized archive, and a traversal entry.

---

### LD-211 US health records

Priority: P1. Effort: large. Depends on: LD-204 for the iOS route, LD-208 for the server route.

Rationale. Wearable data is only part of a personal health record. The rest sits with providers and
insurers, and in the US a consumer app has two ways to reach it. On iPhone, HealthKit exposes the
clinical records a person has already connected in the Health app. On the server, certified EHRs must
offer patient access over SMART on FHIR, and payers must offer patient access APIs.

Scope. Read clinical records through HealthKit in the iOS app. Connect to patient access endpoints
directly or through an aggregator, as open decision 14 settles. Store records as FHIR resources inside
the vault envelope.

Non-goals. Acting as a HIPAA business associate. A person pulling their own records through patient
access is using their own right of access.

Security.
- Clinical records are the most sensitive data the vault will hold. They never reach a pool, a log, or an analytics event.
- An aggregator holds tokens between the person and their provider, so choosing one makes it a disclosed subprocessor under LD-101.

Acceptance criteria.
- [ ] On iOS, connected clinical records import as typed entries that name their source institution.
- [ ] At least one server route, direct or through an aggregator, completes a patient access authorization and import.
- [ ] Clinical records are excluded from every contribution path, asserted by test.
- [ ] The trust centre names any aggregator as a subprocessor.

Tests. FHIR fixtures for the common resource types. A test that clinical records cannot reach a
contribution path.

---

### LD-212 Cross-browser extension builds and store release

Priority: P0. Effort: medium. Depends on: LD-205, LD-206, LD-110 for the privacy policy URL.

Rationale. The extension only loads unpacked, and only in Chromium browsers.
[extension/manifest.json](../extension/manifest.json) declares a `service_worker` background, which
Firefox does not support, and it has no Firefox add-on id. Safari has no `downloads` API on macOS or
iOS, and Firefox for Android does not support it either, so the tier 0 handoff cannot work there as
written. The manifest also lists `http://localhost:3000/*` in its host permissions and content script
matches. A store reviewer will question that, and it should not ship.

Scope. A build that emits one package per browser. A namespace shim. A fallback where `downloads` is
missing. Store listings for Chrome, Edge, Firefox, and Safari.

Implementation.
- `extension/scripts/build.mjs` writes `dist/chrome`, `dist/edge`, `dist/firefox`, and `dist/safari` from one source manifest. Production builds drop localhost. The Firefox build gets `background.scripts`, `browser_specific_settings.gecko` with an add-on id, and the data collection declaration Mozilla now requires. Separate manifests also avoid Chrome versions before 121, which refuse a manifest that declares both background forms.
- A `browser`/`chrome` namespace shim so the same source runs everywhere.
- Where `downloads` is missing, tier 0 opens the vault import page with the walkthrough instead of watching for the file.
- Safari ships inside a container app built with `xcrun safari-web-extension-converter`, under the organization Apple developer account.
- CI runs the existing extension tests against every emitted manifest, and `web-ext lint` against the Firefox build.

Security.
- Each browser's install-time permission set stays exactly what LD-205 pinned. A test fails if any emitted manifest widens it.
- Store privacy disclosures must match `extension/tiers.json` and the trust centre page.

Acceptance criteria.
- [ ] Each emitted package loads in its browser and completes the bridge handshake.
- [ ] No production manifest contains localhost.
- [ ] Every emitted manifest holds the pinned permission set and nothing more.
- [ ] Tier 0 works, or falls back cleanly, on Safari and Firefox for Android.
- [ ] Listings are live in all four stores, and `/trust/extension` links to them.

Tests. A snapshot test per emitted manifest. A Playwright run that loads the Chromium build. The
existing tier and URL-safety tests.

---

### LD-213 Platform data through portability channels

Priority: P2. Effort: medium. Depends on: LD-210.

Rationale. Social and platform APIs are closed or narrow. Meta retired the Instagram Basic Display API in
December 2024. Facebook Graph access to personal posts needs Meta's app review and is granted narrowly.
Spotify's extended API access needs Spotify's approval. What stays open are the export files every major
platform must provide, and Meta's program that lists approved services as destinations in its export
tool. Google's Data Portability API exists, but Google built it for EU users under the Digital Markets
Act, so for a US-first product Takeout is the practical route.

Scope. Export adapters for Facebook, Instagram, Spotify, Netflix, Amazon, LinkedIn, and X archives. An
application to Meta's data portability destination program once the adapters work.

Non-goals. Scraping, or any automation that uses a person's credentials on another site.

Acceptance criteria.
- [ ] Each adapter parses a fixture export into typed or custom entries.
- [ ] Each source has a walkthrough that names its adapter.
- [ ] Nothing from these sources can be sold without a classification, which already fails closed.

Tests. A fixture export per adapter, including a malformed file.

---

### LD-214 Health timeline and insights

Priority: P0. Effort: medium. Depends on: LD-209, and LD-103 at scale.

Rationale. Imported health entries appear in the vault as a list of encrypted records. Nothing shows a
week of sleep next to resting heart rate, or which device a number came from. For a health product this
view is what brings people back, and it has to be built in the browser because the server cannot read
the data.

Scope. A timeline with daily charts per metric, gaps shown as gaps, a source label on each value, and
simple trends. The mobile app runs the same aggregation code.

Non-goals. Diagnosis or medical advice. Apple guideline 1.4.1 scrutinises medical claims, and the
product makes none.

Implementation.
- Decrypt and aggregate in the browser, in a pure module that LD-609 shares with the app.
- Read from the LD-103 IndexedDB index so a year of daily entries renders quickly, and clear it on lock.
- Make onboarding start with connecting a source or importing an Apple Health export.
- Count visits for the LD-610 measures: one increment per person per day the timeline is opened, kept as a daily count with no metric, date range, or value attached, and read by `product_metrics` as timeline visits per week. Signed-in pages stay out of the page-view analytics, so this counter is the only record.

Security. Aggregates are plaintext in memory and in the local index. Treat them like the LD-103 index:
never sent to the server, and cleared on lock and sign-out.

Acceptance criteria.
- [ ] A year of daily entries renders in under two seconds on a mid-range laptop.
- [ ] Each value shows its source, and overlapping sources are not counted twice.
- [ ] Nothing derived from health entries leaves the browser.
- [ ] The view is keyboard accessible and passes the axe scan.
- [ ] Timeline visits per week appear in the `product_metrics` output.

Tests. Aggregation unit tests with overlapping sources. A network-silence test. The accessibility suite.

---

### LD-301 Rights and data subject request engine

Priority: P0. Effort: large. Depends on: LD-102.

Rationale. GDPR, UK DUAA, and US state privacy law all require authenticated rights handling with tracked deadlines. LucidData has export and deletion primitives but no case management, no clock, no appeal path, and no evidence trail. This is launch-blocking for EU and UK, and it is also a product feature: Permission Slip and Optery turned rights handling into their entire value proposition.

Stories.
- As a user, I want to file an access, correction, deletion, restriction, or portability request and see its status.
- As a user, I want to appeal a refusal.
- As an operator, I want an immutable evidence record for every case.

Scope. A rights case model with type, jurisdiction, status, deadline, extension, pause, and resolution. A user-facing request surface. An operator queue. Immutable evidence written to the audit chain. Appeal handling.

Data changes. New migration `<timestamp>_rights_cases.sql`:
- `rights_cases`: `id`, `user_id`, `type` in `access|correction|deletion|restriction|portability|appeal`, `jurisdiction`, `status` in `received|verifying|in_progress|paused|fulfilled|refused|appealed`, `received_at`, `due_at`, `extended_to`, `paused_at`, `resumed_at`, `resolution`, `resolution_note`, `created_at`. Row level security scoped to `user_id`, with operator access through the service role only.
- `rights_case_events`: append-only, `case_id`, `event`, `actor`, `detail`, `created_at`.

Implementation.
- `packages/core/src/validations/rights.ts`, `lib/repositories/rights.repository.ts`, `lib/services/rights.service.ts`, `lib/actions/rights.actions.ts`.
- Deadline calculation in a pure module `packages/core/src/utils/rights-deadlines.ts` so it is testable. One month base, extension where permitted, and stop-the-clock on a clarification request per UK DUAA.
- `app/(dashboard)/privacy/page.tsx` for the user surface.
- Reuse [packages/core/src/crypto/vault-export.ts](../packages/core/src/crypto/vault-export.ts) for portability fulfilment.

Security. Requests must be authenticated. Never accept a user id from the client. Deletion must reuse the existing `deleteAccount` path rather than a parallel implementation. Every state change writes an audit entry.

Acceptance criteria.
- [ ] A user can open each request type and see status and due date.
- [ ] The deadline engine computes base, extension, pause, and resume correctly for GDPR and UK rules.
- [ ] Every transition writes an immutable event and an audit entry.
- [ ] A refusal can be appealed and the appeal is tracked as its own case.
- [ ] Portability fulfilment produces the browser-side export without sending plaintext or keys to the server.
- [ ] Deletion reuses `account.service.deleteAccount`.

Tests. Table-driven deadline tests including leap and month-end cases. A test that a paused case does not accrue time. A test that events cannot be updated or deleted. An end-to-end test covering file, fulfil, refuse, and appeal.

Telemetry. Cases by type, time to fulfil, extension rate, appeal rate.

---

### LD-302 Universal opt-out signal handling

Priority: P0. Effort: small. Depends on: none.

Rationale. California recognises Global Privacy Control, and several state laws require honouring a universal opt-out mechanism. Verified absent from the workspace. Low effort, and it directly supports the sovereignty positioning.

Scope. Detect the `Sec-GPC` header and the `navigator.globalPrivacyControl` property. Record the signal against the user or session. Suppress any sale, sharing, or targeted processing before it begins. Surface the detected state in settings.

Implementation.
- Read `Sec-GPC` in [lib/supabase/middleware.ts](../lib/supabase/middleware.ts) and attach it to the request context.
- Persist to a `users.universal_opt_out` boolean plus `universal_opt_out_source` and `universal_opt_out_at`.
- Gate marketplace contribution eligibility in [lib/services/contribution.service.ts](../lib/services/contribution.service.ts) on the flag.
- Show the detected state and its effect in settings.

Acceptance criteria.
- [ ] A request carrying `Sec-GPC: 1` sets the flag on first authenticated request.
- [ ] With the flag set, contribution to a pool is refused with a clear reason.
- [ ] The setting is visible and explains what it does.
- [ ] Signal detection writes an audit entry once, not on every request.
- [ ] A user can still explicitly opt in afterwards, and that choice is recorded as an override.

Tests. Middleware unit tests for header parsing. A service test that contribution is blocked. A test that the override path is recorded distinctly.

---

### LD-303 Signed consent receipts

Priority: P0. Effort: medium. Depends on: none.

Rationale. Meeco, EUDI, and AWS Data Exchange all treat a grant as a first-class object with a receipt. LucidData records consent with a purpose and a window but produces no portable artifact either party can keep or present. A receipt makes consent inspectable, disputable, and portable, which is the concrete form of the ownership claim. It also directly supports the DGA record-keeping expectation.

Stories.
- As a user, I want a receipt for every grant, so I can prove what I agreed to.
- As an organization, I want a signed receipt, so I can evidence lawful access during an audit.

Scope. A receipt generated on grant, extension, and revocation. Server-signed with the existing Ed25519 machinery. Downloadable as JSON. Verifiable at a public route. Linked into the audit chain.

Receipt contents: receipt id, subject reference, recipient, data categories, purpose, permitted actions, start and end, legal basis, whether access is one-time or continuous, compensation if any, onward-use limit, revocation state, policy version, and issuance time.

Implementation.
- `lib/crypto/consent-receipt.ts` for canonicalization and signing, mirroring [lib/crypto/credential-signing.ts](../lib/crypto/credential-signing.ts).
- Migration adding `consent_receipts` with the signed payload and signature, row level security scoped to the subject, and read access for the named recipient organization.
- Extend [lib/services/consent.service.ts](../lib/services/consent.service.ts) to emit a receipt on every state change.
- `app/verify/receipt/[id]/page.tsx` for public verification, reusing the pattern in [app/verify/[token]/page.tsx](../app/verify/%5Btoken%5D/page.tsx).
- A download control in [components/consent/consent-view-dialog.tsx](../components/consent/consent-view-dialog.tsx).

Security. Sign server-side. The receipt must not contain vault content, only categories and terms. Revocation produces a new receipt rather than mutating the original.

Acceptance criteria.
- [ ] Granting consent produces a signed receipt containing every field above.
- [ ] The receipt verifies at the public route and fails if a byte is altered.
- [ ] Revocation and extension each produce a new receipt referencing the prior one.
- [ ] Receipts contain no vault content.
- [ ] The receipt hash is written into the audit chain.
- [ ] Both the user and the recipient organization can retrieve their receipts.

Tests. Signature round-trip and tamper-detection tests. A canonicalization stability test so field ordering cannot change the signature. An end-to-end test covering grant, download, verify, revoke, and re-verify.

---

### LD-304 Portable import and account transfer

Priority: P1. Effort: medium. Depends on: LD-303.

Rationale. The EU Data Act expects switching assistance and no lock-in, and portability under GDPR expects a usable machine-readable export. LucidData exports JSON-LD but cannot import its own export, so portability is one-directional and the claim is incomplete.

Scope. Import a LucidData export into a new account, preserving identifiers, provenance, consent references, and credential bytes. A verification step confirming the audit chain of the source export. A direct transfer receipt.

Implementation.
- `packages/core/src/vault/portable-import.ts` reversing [packages/core/src/crypto/vault-export.ts](../packages/core/src/crypto/vault-export.ts).
- Decrypt in the source browser, re-encrypt under the destination master key. Plaintext never leaves the browser.
- Preserve original identifiers in a `source_entry_id` metadata field so audit references remain resolvable.

Acceptance criteria.
- [ ] Export followed by import reproduces every entry with identical decrypted content.
- [ ] Provenance, schema type, category, and tags survive the round trip.
- [ ] Credential bytes survive unchanged and still verify.
- [ ] The import runs entirely in the browser.
- [ ] A transfer receipt is produced for both sides.
- [ ] Importing a tampered export fails with a clear error.

Tests. A property-style round-trip test over generated entries. A tampered-export rejection test. A large-export performance test.

---

### LD-305 Health summary sharing

Priority: P1. Effort: medium. Depends on: LD-214, LD-303.

Rationale. The most common thing a person does with health data is show it to someone: a doctor at an
appointment, a coach, a physiotherapist. Consent grants in this product are built for organizations with
accounts, and a clinician in a ten-minute appointment will not register one.

Scope. A time-limited, revocable share of chosen categories over a date range, opened from a link or QR
code without an account. An optional PDF or FHIR bundle generated in the browser.

Implementation.
- Encrypt the snapshot in the browser with a random key carried in the link fragment, which browsers do not send to the server. The server stores ciphertext and an expiry.
- Reuse the public verification route pattern from [app/verify/[token]/page.tsx](../app/verify/%5Btoken%5D/page.tsx) for the viewer.
- Each share produces an LD-303 consent receipt and an audit entry. Revoking a share deletes its ciphertext.

Security.
- The share screen says plainly that a recipient can keep what they saw. Revoking stops future views; it cannot undo a screenshot.
- Every share has an expiry, with a short default.

Acceptance criteria.
- [ ] A person shares chosen categories over a date range, and the recipient opens the share without an account.
- [ ] The server cannot read a share, asserted by test.
- [ ] An expired or revoked share no longer opens.
- [ ] Every share and revocation produces a receipt and an audit entry.

Tests. A fragment-key round trip. A server-side read attempt that fails. Expiry and revocation tests.

---

### LD-401 Standards-based credential formats

Priority: P1. Effort: large. Depends on: none.

Rationale. LucidData signs credentials with Ed25519 over a canonical payload, which is cryptographically sound but not interoperable. Meeco supports SD-JWT VC and mdoc, SpruceID and Entra target OpenID4VP, and EU member states must offer wallets by the end of 2026. Without standard formats, LucidData credentials only work inside LucidData, which caps organization value.

Scope. A credential format registry. W3C VC 2.0 output. SD-JWT VC behind a version-pinned adapter. OpenID4VCI issuance and OpenID4VP presentation. Preserve original signed bytes and record the verification result.

Non-goals. Making VC 2.0 the only wire format. DID methods, which stay behind LD-403 and a partner commitment.

Implementation.
- `lib/credentials/formats/` with one module per format exposing `issue`, `verify`, and `describe`.
- A registry keyed by format and version. Unsupported or ambiguous formats must fail closed.
- Store `format`, `format_version`, `original_bytes`, `verification_result`, `issuer_key_id`, and `status_result` on the credential row.
- Add OpenID4VCI and OpenID4VP endpoints under `app/api/oid4vc/`.

Security. Verification must check nonce, audience, replay, holder binding, expiry, and status. A failure in any check fails the whole verification. Never accept a credential whose format is inferred rather than declared.

Acceptance criteria.
- [ ] A credential can be issued as VC 2.0 and verifies with an external validator. **Issued, not externally validated.** The document is VC 2.0 in structure, but the proof is Ed25519 over this codebase's canonical JSON rather than over RDF Dataset Canonicalization, so a verifier requiring a normative Linked Data proof cannot check it. Closing this means taking an RDF canonicalization dependency. The format's own `describe()` says so rather than implying conformance.
- [ ] SD-JWT VC issuance and verification pass digest disclosure, decoy, and key-binding tests. **Disclosure and decoy pass; key binding is not implemented.** A presentation carries no holder-binding JWT, so `verify` refuses rather than silently passing when a verifier supplies a nonce. That is the safe failure, not the feature.
- [x] An unknown format fails closed with an explicit error.
- [x] Original signed bytes are preserved and re-verifiable after storage.
- [x] Replay of a presentation is rejected. Rejected because holder binding is absent, so a nonce cannot be checked. This becomes a real replay defence only once key binding lands.
- [x] Existing Ed25519 credentials continue to verify.

Tests. Conformance vectors per format. Negative tests for nonce reuse, wrong audience, expired status, and revoked status. A migration test proving existing credentials still verify.

Rollout. Add formats alongside the existing one. Do not migrate issued credentials.

---

### LD-402 Derived proofs and predicate disclosure

Priority: P1. Effort: medium. Depends on: LD-401.

Rationale. EUDI, SpruceID, and Entra have made attribute-level and predicate disclosure the expectation. Entra's Face Check returns a match result rather than the biometric. LucidData supports per-field disclosure but still reveals the underlying value, so proving age means disclosing a birth date. Derived proofs are also what let buyers purchase a verified claim instead of raw data, which is the most defensible marketplace position.

Scope. Predicate proofs over held credentials and vault values: over or under a threshold, membership in a set, and band membership. Verifier-side presentation of the predicate result and its provenance.

Implementation.
- `lib/credentials/predicates.ts` defining supported predicates and their canonical statements.
- Extend the share flow in [lib/services/share.service.ts](../lib/services/share.service.ts) to allow a predicate instead of a field value.
- Extend the verify surface to show the predicate, the result, and the issuer that vouched for the underlying value.

Security. The predicate result must be derived from a signed credential, not from an unverified vault entry, whenever the verifier relies on it. If the source is an unverified vault entry, the verification surface must say so explicitly.

Acceptance criteria.
- [ ] A user can share "over 18" without disclosing a birth date.
- [ ] A user can share an income band without disclosing an income.
- [ ] The verifier sees the predicate, the result, the issuer, and the assurance source.
- [ ] A predicate derived from an unverified entry is labelled as self-asserted.
- [ ] The underlying value is not recoverable from the shared artifact.

Tests. Boundary tests on each predicate. A test asserting the raw value is absent from the payload. A test distinguishing issuer-vouched from self-asserted.

---

### LD-403 Delegation and household roles

Priority: P2. Effort: large. Depends on: LD-303.

Rationale. Meeco supports read-only and full delegation. DeleteMe and Incogni sell family plans. Health and eldercare use cases require a guardian or caregiver. LucidData has organization roles but no personal delegation.

Scope. Invite a delegate with a scoped role of viewer, contributor, or full. Time-bound delegation with its own receipt. Audit entries attributing every delegated action.

Security. Delegation must not transfer the master key. A delegate needs their own wrapped copy of a scoped key, or access limited to entries explicitly shared. Decide and threat-model this before implementation. Do not silently widen the trust model.

Acceptance criteria.
- [ ] Delegation is time-bound and revocable.
- [ ] Every delegated action is attributed to the delegate in the audit log.
- [ ] A delegate cannot escalate their own scope.
- [ ] Revocation takes effect immediately.
- [ ] The threat model page from LD-101 is updated in the same pull request.

---

### LD-404 Proximity credential presentation

Priority: P1. Effort: large. Depends on: LD-204 stage A, LD-401, LD-402.

Rationale. Credentials are checked in person. A homeowner wants to know a tradesperson holds a current
licence and public liability cover before work starts. A landlord checks a reference. A patient checks a
visiting carer. In every case the check happens face to face, in seconds, possibly in a basement with no
signal, and the person checking has no account and no reason to create one.

LucidData cannot do this today. The existing flow in
[app/verify/[token]/page.tsx](../app/verify/%5Btoken%5D/page.tsx) requires a share token, a server round
trip, and a browser. That works for sending a credential to an employer. It does not work standing on a
doorstep.

This is also the product's best organic growth mechanism. Every presentation puts LucidData in front of
someone who just watched it answer a question they actually had. No other feature in this roadmap markets
itself that way.

Stories.
- As a tradesperson, I want to prove my licence and insurance are current, without handing over documents that contain my home address.
- As a customer, I want to check that proof in seconds, without installing anything or creating an account.
- As a tradesperson, I want this to work where there is no signal.

Scope. Self-contained presentation over QR, with NFC or BLE where the platform supports it. Offline
verification. Selective and predicate disclosure through LD-402. A verifier view that works in a plain
browser for people without the app.

Non-goals. Building a general identity document wallet. Replacing the existing share-token flow, which
remains correct for remote verification.

Architecture. Offline verification is the constraint that drives everything else. The verifier cannot
call LucidData, so the presented artifact must carry its own proof: the issuer's signature, the disclosed
claims, a holder binding, and a validity window, in a format the verifier can check against a cached
issuer key. This is precisely why LD-401 is a dependency. The current bespoke Ed25519 payload is designed
for server-side verification and is not a suitable offline presentation format. Use SD-JWT VC, and treat
mdoc as the option if a partner requires ISO 18013-5 alignment.

Revocation is the honest limitation. A fully offline check cannot see a revocation issued five minutes
ago. Handle it explicitly: show the credential's issuance and validity dates, show when revocation status
was last refreshed, and let the verifier re-check online when they have signal. Do not present an offline
check as equivalent to a live one.

Security.
- Present the minimum. "Holds a current licence" and "insured to the required level" are predicates under LD-402, and must not require disclosing a home address, date of birth, or policy number.
- Bind the presentation to the holder so a screenshot cannot be reused. Require a fresh device-held proof per presentation.
- Include a verifier-supplied nonce where the channel allows it, and reject replayed presentations.
- The verifier surface must clearly separate issuer-vouched claims from self-asserted ones. "Is he insured" is only meaningful if an insurer issued it. A self-asserted insurance claim must be visibly labelled as such, or the feature actively misleads.
- Never require the verifier to authenticate or be tracked. Verification must leave no account and no profile behind.

Acceptance criteria.
- [ ] A credential verifies with both devices offline.
- [ ] The verifier needs no LucidData account and no app install.
- [ ] A presentation discloses only the selected claims or predicates.
- [ ] A captured or replayed presentation fails verification.
- [ ] Issuer-vouched and self-asserted claims are visually distinct, and a self-asserted claim can never appear as verified.
- [ ] Revocation freshness is displayed, and the verifier can re-check online.
- [ ] An expired or revoked credential fails clearly rather than degrading to a warning.
- [ ] Verification creates no persistent record about the verifier.

Tests. An offline verification test with both sides airplaned. A replay test using a captured
presentation. A test asserting a self-asserted claim never renders as issuer-verified. A tamper test on
the presented payload. A nonce-reuse rejection test.

Open dependency. The value of this feature depends on issuers existing. "Verify my plumber's insurance"
requires the insurer or a trade body to issue the credential. Sequence issuer onboarding for one vertical
alongside this work, or the feature ships into an ecosystem with nothing authoritative to present. See
open decision 7.

---

### LD-405 Credential correction, supersession, and renewal

Priority: P1. Effort: medium. Depends on: LD-401.

Rationale. Credentials are statements organizations make about people, and organizations get them wrong.
A misspelled name, a wrong qualification date, or a credential issued to the wrong person currently has
no correction path. The subject cannot dispute it, and the only remedy is revoke and reissue, which
leaves the verifier looking at two credentials with no indication which supersedes the other.

Renewal has the same shape. An insurer reissuing annual proof of coverage, or a licensing body renewing
certifications, has to reissue each credential individually with no link back to what it replaces.

Under GDPR the subject has a right to rectification, so this is also a rights obligation, not only a
convenience.

Stories.
- As a credential subject, I want to tell the issuer that a credential about me is wrong.
- As an issuer, I want to correct a credential without leaving a confusing trail.
- As a verifier, I want to know when what I am looking at has been superseded.

Scope. A dispute path from the holder to the issuer. A correction flow that issues a replacement linked
to the original. A supersession pointer that verifiers can follow. Renewal that preserves the chain.
Expiry reminders for holder and issuer.

Verification precedence, which must be applied in this order so LD-405 and LD-406 cannot disagree:

1. Revoked by the issuer gives a revoked result.
2. Superseded gives a replaced result, naming the replacement.
3. Signed by a key later declared compromised, after the compromise timestamp, gives a failed result.
4. Signed by a key later declared compromised, before the compromise timestamp, gives a valid result carrying a re-check warning.
5. Expired gives an expired result.
6. Otherwise valid.

Data changes. Add `supersedes_credential_id` and `superseded_by_credential_id` to the credentials table,
plus a `credential_disputes` table with row level security scoped to the subject and the issuing
organization.

Security.
- A dispute must not let the subject alter the credential. Only the issuer can correct it.
- A superseded credential must fail verification as current, and the verifier must be shown the replacement rather than a bare failure.
- Corrections must be linked to an LD-301 rectification case when the subject invoked a legal right, so the statutory clock is tracked.

Acceptance criteria.
- [ ] A holder can raise a dispute against a credential and see its status.
- [ ] An issuer can correct a credential, producing a replacement linked to the original.
- [ ] Verifying a superseded credential surfaces the replacement.
- [ ] Renewal preserves the supersession chain.
- [ ] Expiry reminders reach both holder and issuer before the expiry date.
- [ ] A dispute raised as a rectification right creates an LD-301 case with a deadline.

Tests. A supersession chain test across several generations. A verification test asserting a superseded
credential does not present as current. A test that a dispute cannot mutate the credential.

---

### LD-406 Issuer key lifecycle and compromise response

Priority: P0. Effort: medium. Depends on: LD-601.

Rationale. Issuer signing keys are created once and never rotated. There is no rotation path, no key
versioning beyond an active status, and no defined response to a compromised key. Because every issued
credential is verified against the issuer key, a stolen key allows an attacker to forge credentials that
verify correctly, including the licence and insurance claims LD-404 is built to present. The blast
radius covers every credential that issuer has ever issued.

This is a small amount of work standing in front of a large amount of risk.

Stories.
- As an issuer, I want to rotate my signing key on a schedule without invalidating past credentials.
- As an issuer whose key is compromised, I want a defined containment path.
- As a verifier, I want to know a credential was signed by a key that was valid at signing time.

Scope. Key rotation with overlap. Key versioning with validity windows. Retention of retired public keys
for historical verification. A compromise path that invalidates a key and everything signed after the
compromise. Key age tracking with rotation prompts.

Implementation.
- Extend [lib/services/issuer-key.service.ts](../lib/services/issuer-key.service.ts) with rotation, retirement, and compromise, keeping retired public keys published at the existing endpoint so old credentials still verify.
- Include a key identifier in the signed payload so verification selects the correct key rather than assuming the current one.
- Use the LD-601 runner to track key age and prompt rotation.

Security.
- Verification must select the key by identifier and check it was valid at signing time. Never verify against whichever key is current.
- Compromise must distinguish a key that is retired normally, whose past credentials stay valid, from one that is compromised, whose credentials require review.
- Declaring a compromise must notify every holder of an affected credential, and must be audited.
- Rotation must never expose a private key to the client. Wrapping stays server-side under `ISSUER_KEY_SECRET`.

Acceptance criteria.
- [ ] An issuer can rotate keys, and credentials signed with the previous key still verify.
- [ ] The signed payload carries a key identifier, and verification selects on it.
- [ ] A credential signed after a compromise timestamp fails verification.
- [ ] Declaring a compromise notifies affected holders and writes an audit entry.
- [ ] Retired public keys remain published for historical verification.
- [ ] Key age is tracked and rotation is prompted.
- [ ] Existing credentials issued before this change continue to verify.

Tests. A rotation test proving old credentials still verify. A compromise test proving post-compromise
signatures fail while earlier ones pass. A migration test over existing credentials.

---

### LD-501 Real anonymization guarantees

Priority: P0. Effort: large. Depends on: none.

Rationale. The only protection today is a `minimum_contributors` count checked at purchase in [lib/services/data-order.service.ts](../lib/services/data-order.service.ts). A count is not anonymity. A pool of 50 contributors can still uniquely identify someone through quasi-identifiers such as postcode, birth date, and employer. Selling that data would be a serious harm and the fastest way to destroy the product's premise. This gates any growth of the marketplace.

Scope. Quasi-identifier classification per schema field. k-anonymity enforcement on the release, not just the contributor count. Generalization and suppression before release. Optional differential privacy noise on aggregates. A privacy report attached to every order.

Implementation.
- `packages/core/src/privacy/quasi-identifiers.ts` classifying every field in [packages/core/src/schemas/vault-schemas.ts](../packages/core/src/schemas/vault-schemas.ts) as identifier, quasi-identifier, sensitive, or safe. Fields from user-defined custom schemas have no classification and therefore default to sensitive, which excludes them from release until someone classifies them explicitly. Failing closed is the only safe default here.
- `lib/privacy/k-anonymity.ts` computing equivalence classes and enforcing a configurable k, with generalization ladders for dates, locations, and numeric ranges.
- `lib/privacy/differential-privacy.ts` for aggregate noise with a configurable epsilon and a per-pool budget.
- Enforce in [lib/services/data-order.service.ts](../lib/services/data-order.service.ts) before any export is produced.
- Attach a privacy report to the order: k achieved, fields generalized, records suppressed, epsilon spent.

Security. Direct identifiers must be dropped, never hashed and released, because hashes are re-identifiable against a known population. If a release cannot reach the configured k, it must fail rather than release with a warning.

Acceptance criteria.
- [ ] Every schema field has a documented privacy classification.
- [ ] A release that cannot reach k is refused and the buyer is told why without revealing the cohort.
- [ ] Generalization is applied deterministically and is reproducible from the order record.
- [ ] Direct identifiers never appear in a release.
- [ ] Every order carries a privacy report.
- [ ] Epsilon spend is tracked per pool and exhaustion blocks further aggregate release.

Tests. Unit tests for equivalence class computation. A re-identification test using a crafted dataset where a naive count passes but k-anonymity correctly fails. Generalization ladder tests. Determinism tests. A test that the export path cannot be reached without passing the privacy gate.

Telemetry. Refused releases by reason, average k achieved, suppression rate.

---

### LD-502 Governed access instead of copies

Priority: P1. Effort: large. Depends on: LD-501, LD-303.

Rationale. Snowflake, BigQuery, and Databricks have made live governed read-only access the enterprise norm, with provider revocation and usage telemetry. Databricks Clean Rooms go further and require mutual approval of the computation. LucidData ships a snapshot export, which means revocation is meaningless after delivery and the user's ownership claim ends at download. Vana states this limitation openly. Moving from copies to governed access is the strongest available marketplace differentiator.

Scope. A query interface over approved aggregates instead of raw export. Buyer-submitted computations approved before running. Read-only results. Usage telemetry visible to contributors. Revocation that actually removes future access.

Non-goals. Removing export entirely. Some buyers need files, and those orders keep the LD-501 gate plus explicit disclosure that copies cannot be recalled.

Implementation.
- `lib/services/governed-access.service.ts` exposing a constrained query surface over pool data with the privacy gate applied to every result.
- An approval workflow storing the exact computation, its version, and the approving contributors' consent scope.
- A usage log surfaced in the contributor marketplace view.

Acceptance criteria.
- [ ] A buyer can run an approved aggregate query and receive only gated results.
- [ ] An unapproved or modified computation is refused.
- [ ] Contributors see when their data was used and by whom.
- [ ] Revocation removes future access immediately.
- [ ] Export orders display a clear statement that delivered copies cannot be recalled.
- [ ] Every query passes the LD-501 privacy gate.

Tests. A test that a modified computation hash is rejected. A test that revocation blocks the next query. A test that no query path bypasses the privacy gate.

---

### LD-503 Buyer evaluation surface

Priority: P1. Effort: medium. Depends on: LD-501.

Rationale. Snowflake, AWS, and Databricks all let buyers inspect schema, samples, and quality before committing, and Databricks ships executable evaluation assets. LucidData buyers currently commit to a purchase with little visibility, which suppresses conversion. Optery's free scan shows the same principle on the consumer side.

Scope. Per-pool schema description, field coverage, freshness distribution, contributor count band, and synthetic sample records generated from the schema rather than from real contributions.

Security. Samples must be synthetic. Never derive a preview from real records, even aggregated, because small pools leak.

Acceptance criteria.
- [ ] Each pool shows schema, coverage per field, and freshness.
- [ ] Sample records are synthetic and labelled as such.
- [ ] No preview path reads real contribution content.
- [ ] Quality metrics update as the pool changes.

Tests. A test asserting the sample generator never touches contribution rows. Coverage computation tests.

---

### LD-504 Offer targeting

Priority: P2. Effort: medium. Depends on: LD-503.

Rationale. Offers are currently shown broadly, which produces low relevance for users and low conversion for buyers.

Scope. Match offers to users by schema types held, category, and freshness, computed without exposing vault content to the server. Rank by expected value to the user.

Security. Matching must run against unencrypted metadata only, which means `category`, `schema_type`, and `tags`. If richer matching is wanted, compute it in the browser.

Acceptance criteria.
- [ ] Offers are ranked by relevance and expected payment.
- [ ] Matching reads no vault content.
- [ ] A user can see why an offer was shown.

---

### LD-505 Marketplace pricing and platform fee

Priority: P0. Effort: medium. Depends on: none.

Rationale. The marketplace loses money at scale, and the loss grows with exactly the thing the roadmap
is trying to increase.

The mechanics, verified in code: `computeTotal` in
[lib/services/data-order.service.ts](../lib/services/data-order.service.ts) charges the buyer
`price_cents + recordCount * price_per_record_cents`. `contribute` in
[lib/services/contribution.service.ts](../lib/services/contribution.service.ts) sets each contributor's
`payout_cents` to the full `price_per_record_cents`, and
[lib/services/payout.service.ts](../lib/services/payout.service.ts) transfers that amount with no
`application_fee_amount`. So LucidData retains the fixed access fee and nothing else.

Stripe, however, charges a percentage of the whole transaction. Using standard US card pricing of 2.9%
plus 30 cents as an external assumption, the financial category with a 5000 cent access fee and a 150
cent per-record price breaks even at roughly 1,100 records and loses money on every sale above that. At
10,000 contributors the buyer pays about 15,050 dollars, Stripe takes about 437, and LucidData retains
50, for a net loss near 387 dollars on a single sale.

Worse, `interests` and `other` in [lib/constants/data-pricing.ts](../lib/constants/data-pricing.ts) have
`accessFeeCents: 0`, so those pools return nothing while still incurring the processing fee. Every sale
in those categories is a guaranteed loss.

The incentive is inverted. LD-201, LD-203, and LD-204 all exist to put more data in more vaults, which
makes pools larger, which makes each sale worse. This must be settled before those specs deliver volume.

Stories.
- As the operator, I want each marketplace sale to contribute margin rather than consume it.
- As a contributor, I want to see what I will actually earn, and what LucidData takes, before I agree.
- As a buyer, I want pricing that does not change unpredictably as a pool grows.

Scope. An explicit platform fee. Price floors that prevent a sale from being unprofitable. Fee
transparency to both sides. A pricing model that holds as pools scale.

Validated parameters from section 7. Implement these values unless a business decision changes them,
and keep them in one typed constants module so they cannot drift:

| Parameter | Value | Why |
|---|---|---|
| Platform fee | 25% of gross | Profitable at every pool size tested from 1 to 100,000 records |
| Minimum order value | $50 | Validated floor is $1.36; $50 also matches how buyers actually buy |
| Payout threshold | $25 | Brings payout cost to 9% of the amount moved, against 375% at $0.60 |
| Zero-margin categories | Reprice or withdraw | `interests` and `other` have a zero access fee and cannot cover processing |

Earnings must accrue in a ledger between payouts. A balance is owed on demand when an account closes and
must never expire.

Implementation.
- Take the platform fee on the transfer using Stripe's `application_fee_amount`, rather than by silently reducing the contributor's stated payout. The contributor should see the gross, the fee, and the net.
- Refuse to create an order whose total cannot cover processing plus the minimum margin. Surface this to the buyer as a minimum order value rather than a failure.
- Revisit the zero access fee categories. Either set a floor or withdraw them from sale.
- Recompute the guidance in `DATA_TYPE_PRICING` so the suggested prices produce a viable transaction at realistic pool sizes.

Security and fairness.
- The fee must be disclosed before consent, not discovered at payout. Reklaim's ambiguity between rewards and licensing is the pattern to avoid.
- Changing the fee must not alter the terms of contributions already made. Contributions carry the fee that applied when they were consented, consistent with the receipt in LD-303.

Acceptance criteria.
- [ ] A platform fee is applied and recorded on every marketplace transaction.
- [ ] No order can be created that is unprofitable after processing costs, asserted by test at several pool sizes.
- [ ] Contributors see gross, fee, and net before consenting and on every payout.
- [ ] Earnings accrue in a ledger and pay out only above the threshold, and the pending balance is visible.
- [ ] A closing account is paid any outstanding balance regardless of the threshold.
- [ ] Categories with no viable margin are either repriced or withdrawn from sale.
- [ ] A fee change does not retroactively alter existing contributions.
- [ ] A test asserts profitability across pool sizes from the minimum to ten thousand contributors.
- [ ] User-facing copy about earnings matches the modelled amounts in section 7 and does not promise income.

Tests. A table-driven margin test across categories and pool sizes, including the current failing cases,
so the regression cannot return. A test that consented terms survive a later fee change.

Open decision. The fee level is a business choice, not an engineering one. See open decision 9.

---

### LD-506 Marketplace integrity and fraud controls

Priority: P1. Effort: medium. Depends on: LD-505.

Rationale. Payouts are real money triggered by self-asserted data, and nothing currently prevents a
person from creating several accounts, entering fabricated records, and contributing them to the same
pool. There is no uniqueness constraint tying a contribution to a vault entry, no velocity limit, and no
review threshold before a transfer is sent. A buyer also has no protection against paying for fabricated
data, which damages the supply side's credibility more than the money involved.

Stories.
- As a buyer, I want confidence that a pool is not one person wearing many hats.
- As an honest contributor, I do not want my earnings diluted by fabricated supply.
- As the operator, I want to hold a suspicious payout before it leaves.

Scope. Uniqueness and duplicate detection on contributions. Contribution velocity limits. Signals that
detect a buyer purchasing from contributors related to itself. A payout review threshold and hold.
Weighting verified data above self-asserted data.

Implementation.
- Add a unique constraint on `pool_contributions (pool_id, user_id, vault_data_id)` and a duplicate check in `contribute`.
- Apply per-user and per-pool contribution rate limits.
- Hold payouts above a configurable threshold for review, and reuse the LD-601 runner to release them.
- Prefer issuer-vouched data where available, consistent with the distinction LD-402 already draws.

Acceptance criteria.
- [x] The same vault entry cannot be contributed twice to one pool.
- [x] Contribution velocity limits are enforced per user.
- [x] Payouts above the threshold are held pending review and are visible to the contributor as held.
- [x] A pool reports how much of its supply is issuer-vouched against self-asserted.
- [x] Fraud signals are audited.

Tests. A duplicate contribution test. A velocity limit test. A payout hold and release test.

---

### LD-601 Scheduled job runner

Priority: P0. Effort: small. Depends on: none.

Rationale. `processPendingPayouts()` runs only on a webhook, so a failed Stripe transfer stays pending indefinitely with no retry. Share tokens, consent windows, and credential status also need periodic processing. Contributors not being paid is a trust failure that compounds.

Scope. A scheduled runner covering payout retries with backoff, consent expiry, share token expiry, and connector token refresh.

Implementation. Use a Supabase scheduled Edge Function or a Vercel cron route under `app/api/cron/`. Protect the endpoint with a shared secret and reject unauthenticated calls. Make every job idempotent.

Acceptance criteria.
- [ ] A failed payout retries with exponential backoff and a maximum attempt count.
- [ ] Exhausted retries notify the user and log an error.
- [ ] Expired consents and share tokens are marked expired.
- [ ] Connector tokens refresh before expiry.
- [ ] The cron endpoint rejects unauthenticated requests.
- [ ] Running a job twice produces the same result.

Tests. Idempotency tests per job. A backoff schedule test. An unauthenticated rejection test.

---

### LD-602 Organization developer surface

Priority: P1. Effort: medium. Depends on: LD-303 for receipt payloads.

Rationale. Organizations are the paying side, and they integrate through APIs rather than a portal.
LucidData exposes five route handlers under [app/api/org/](../app/api/org/) with no machine-readable
specification, no outbound webhooks, and no client library, all verified by search. That means every
buyer hand-rolls an integration and has to poll for state changes. Plaid, Terra, Stripe, and
DataSapien all compete substantially on developer surface, and a thin one caps how much organization
revenue the existing features can earn.

This is the cheapest way to increase the value of work already shipped.

Stories.
- As an integrating engineer, I want a specification and a typed client, so I can build without reverse engineering endpoints.
- As an organization, I want a webhook when a consent request is answered, so I do not poll.
- As an integrating engineer, I want a sandbox, so I can test without touching real user data.

Scope. An OpenAPI specification covering the org endpoints. Explicit API versioning. Signed outbound
webhooks with retries. A generated TypeScript client. A sandbox mode. Developer documentation.

Non-goals. A public API over individual vault data. Vault content stays under the consent and
credential flows.

Data changes. New migration `<timestamp>_org_webhooks.sql`:
- `org_webhooks`: `id`, `organization_id`, `url`, `secret_hash`, `events text[]`, `status`, `created_at`.
- `webhook_deliveries`: `id`, `webhook_id`, `event`, `payload`, `attempts`, `status`, `last_error`, `next_attempt_at`. Row level security scoped through organization membership. Writes come from the service role.

Implementation.
- Generate the specification from the existing Zod schemas in `packages/core/src/validations/` so it cannot drift from the implementation.
- `lib/services/webhook.service.ts` for signing, dispatch, and retry. Reuse the LD-601 runner for redelivery.
- Sign with HMAC SHA-256 over the raw body plus a timestamp, matching the pattern already proven in [app/api/stripe/webhook/route.ts](../app/api/stripe/webhook/route.ts).

Security.
- Webhook payloads carry an event type, an organization identifier, a resource type, an opaque resource identifier, and a timestamp. They must not carry a user identifier, an email address, a data category, a purpose string, credential claims, or vault content. The recipient calls back with its API key to fetch detail.
- Include a timestamp and reject stale signatures to prevent replay.
- Validate destination URLs against internal address ranges to prevent server-side request forgery.
- Sandbox must use isolated data and must never read production user rows.

Acceptance criteria.
- [ ] The OpenAPI document is generated from the Zod schemas and validates against the live endpoints in CI.
- [ ] Webhook payloads contain no personal data, and a test asserts this.
- [ ] Signatures verify, and a tampered body or stale timestamp is rejected.
- [ ] Failed deliveries retry with backoff and are visible to the organization.
- [ ] A webhook URL pointing at an internal address is refused.
- [ ] Sandbox mode cannot read production data.
- [ ] The endpoints are versioned, and an unversioned request resolves to a documented default.

Tests. A CI check that the specification matches the routes. Signature verification and replay tests. A
server-side request forgery test. A payload test asserting no personal fields are present.

---

### LD-603 Organization team management

Priority: P0. Effort: small. Depends on: none.

Rationale. Organizations are effectively single-user today. `addOrgMember` in
[lib/middleware/withOrgMember.ts](../lib/middleware/withOrgMember.ts) is called from exactly one place,
[app/api/org/register/route.ts](../app/api/org/register/route.ts), to make the creator an owner. There
is no invitation flow, no member management surface, and no way to assign any other role.

The consequence is that the entire role model, covering owner, issuer_admin, verifier, and member, is
unreachable. Every permission check written against those roles guards a state the product cannot enter.
No university registrar, HR team, or clinic operates as one person, so this blocks institutional use
outright, and it is a small amount of work.

Stories.
- As an owner, I want to invite colleagues and assign roles.
- As an organization, I want to remove someone's access the day they leave.
- As an auditor, I want to see who did what on behalf of the organization.

Scope. Email invitations with role assignment. A member list with role changes and removal. Ownership
transfer. Per-member action attribution in the audit log. Basic usage reporting covering credentials
issued, verifications performed, and requests sent.

Non-goals. SAML or SCIM provisioning. Worth doing later for large enterprises, but the immediate blocker
is that a second person cannot join at all.

Security.
- Only owners may invite, change roles, or remove members.
- An organization must always retain at least one owner. Removing the last owner must fail.
- Invitations must expire, be single use, and be bound to the invited address.
- Removal must take effect immediately, including for any active session.
- Every membership change is audited with the acting user.

Acceptance criteria.
- [ ] An owner can invite a colleague, who joins with the assigned role.
- [ ] Each role grants exactly the permissions its existing checks describe, verified per role.
- [ ] Removing the last owner is refused.
- [ ] Removal revokes access immediately, including active sessions.
- [ ] Invitations expire and cannot be reused.
- [ ] Organization actions are attributable to the individual member who performed them.

Tests. A permission matrix test covering every role against every gated action. A last-owner protection
test. An invitation replay test.

---

### LD-604 Bulk and asynchronous organization operations

Priority: P1. Effort: medium. Depends on: LD-602, LD-601, LD-603.

Rationale. Institutional volume is the normal case, not the exception. A university issues thousands of
credentials at graduation, an insurer renews an entire book on the policy anniversary, and a public body
requests verification from a large applicant cohort. Today every one of those is a single record through
a single endpoint, with no batching, no asynchronous job, and no completion signal. A licensing body
wanting to revoke a cohort has to iterate one call at a time.

Stories.
- As an issuer, I want to upload a file and issue thousands of credentials in one operation.
- As an issuer, I want to see progress and know which rows failed and why.
- As an organization, I want to revoke or renew in bulk.

Scope. Bulk issuance from a structured upload. Bulk revocation and renewal. Bulk credential and consent
requests. Asynchronous jobs with progress, partial failure reporting, and a webhook on completion.

Implementation.
- Add a jobs table with per-row status, so a partial failure is inspectable rather than fatal.
- Process on the LD-601 runner. Make every job resumable and idempotent so a retry cannot double-issue.
- Emit LD-602 webhooks on completion and failure.

Security.
- Bulk operations amplify mistakes, so require confirmation showing the affected count before execution, and support cancellation of a running job.
- Enforce rate and size limits, and apply plan quotas to bulk paths as well as single ones.
- Uploaded files may contain personal data for people who are not yet users. Encrypt at rest, set a short retention, and delete after processing.
- Every row-level outcome is audited, not just the job.

Acceptance criteria.
- [ ] An issuer can issue in bulk from a file and see per-row results.
- [ ] A partially failed job reports which rows failed and why, and can be retried for only those rows.
- [ ] Re-running a job does not duplicate issuance.
- [ ] Bulk revocation and renewal are supported.
- [ ] A running job can be cancelled.
- [ ] Completion and failure emit webhooks.
- [ ] Uploaded source files are deleted after processing.

Tests. An idempotency test on job retry. A partial-failure test. A cancellation test. A test that
uploaded files do not persist beyond processing.

---

### LD-605 Platform integrity and insider controls

Priority: P1. Effort: large. Depends on: LD-601.

Rationale. The threat model addresses an attacker reaching the database, and browser-side encryption
handles that well: vault contents stay unreadable. It does not currently address LucidData itself. The
service-role client bypasses row level security by design, and the audit chain, while tamper-evident to
a reader who verifies it, lives in a table that a service-role actor can rewrite wholesale, recomputing
hashes as it goes.

That matters because the audit chain is the evidence a regulator, an auditor, and a user in dispute all
rely on. Its value depends on LucidData being unable to alter it undetectably, which is not true today.

The encrypted vault contents remain safe in all of this. The exposure is metadata, consent records, and
the audit trail.

Stories.
- As a user, I want to detect if LucidData rewrote my history.
- As an auditor, I want evidence that does not rest on trusting the operator.
- As the operator, I want privileged access to be attributable, so an insider cannot act invisibly.

Scope. Periodic external anchoring of the audit chain head. User-verifiable chain digests. Attribution
and logging of service-role operations. Alerting on unusual privileged access.

Implementation.
- Publish a signed digest of each user's chain head on a schedule, and deliver it to the user through the existing notification path. A user holding past digests can prove the history was altered.
- Anchor a global digest externally on a schedule, so the whole table cannot be silently rewritten. A published transparency log or a timestamping authority is sufficient. A blockchain is not required and adds dependencies the product does not otherwise need.
- Wrap [lib/supabase/service.ts](../lib/supabase/service.ts) so every service-role operation records purpose and calling context.
- Alert on privileged reads that fall outside expected patterns.

Security.
- Anchoring must publish digests only. Never publish content, identifiers, or anything correlatable to a person.
- Digest delivery must not create a new way to enumerate users.
- Service-role logging must itself be append-only, or it inherits the problem it exists to solve.

Acceptance criteria.
- [ ] Users receive periodic signed digests of their audit chain head.
- [ ] A user can verify a stored digest against their current chain and detect alteration.
- [ ] A global digest is anchored externally on a schedule.
- [ ] Anchored data contains no personal data or correlatable identifier, asserted by test.
- [ ] Every service-role operation records purpose and calling context.
- [ ] Rewriting history is detectable after the fact in a test that simulates it.

Tests. A tamper-detection test that rewrites the chain and proves an earlier digest exposes it. A test
asserting anchored payloads carry no identifiers. A coverage test that service-role paths are logged.

---

### LD-606 Abuse reporting and enforcement

Priority: P1. Effort: medium. Depends on: LD-603.

Rationale. There is currently no way for a user to report an organization, no way to block one from
contacting them again, and no way for the operator to suspend a bad actor. Once LD-109 makes
organizations accountable at registration, this provides the response path for the ones that turn bad
afterwards. Without it, the only remedy is a database edit.

Scope. User reporting and blocking of an organization. Relying-party reporting of a fraudulent issuer.
Operator suspension of an organization, freezing of payouts, and revocation of API keys. A record of
enforcement actions.

Security.
- Blocking must be enforced server-side on every contact path, not hidden in the interface.
- Suspension must immediately invalidate API keys and stop issuance and requests.
- Enforcement actions are audited with the acting operator, and are covered by the LD-605 service-role attribution.

Acceptance criteria.
- [ ] A user can report and block an organization, and a blocked organization cannot contact them again.
- [ ] An operator can suspend an organization, and suspension halts issuance, requests, and API access immediately.
- [ ] Payouts can be frozen for a specific account under review.
- [ ] Every enforcement action is audited and attributable.
- [ ] A suspended organization's already-issued credentials remain verifiable, with their issuer status shown as suspended.

Tests. A blocked-contact test across every contact path. A suspension test asserting immediate API key
rejection. A test that suspension does not silently invalidate historical credentials.

---

### LD-607 Retention and deletion completeness

Priority: P0. Effort: medium. Depends on: LD-601.

Rationale. Account deletion is incomplete, and the specific mechanism is verifiable.
[lib/services/account.service.ts](../lib/services/account.service.ts) implements `deleteAccount` as an
audit entry followed by `admin.deleteUser`, relying entirely on foreign key behaviour. Two of those keys
do not cascade. In [20260616000007_credentials.sql](../supabase/migrations/20260616000007_credentials.sql),
`issued_credentials.subject_user_id` is `ON DELETE SET NULL`, and in
[20260725150000_marketplace_transaction_integrity.sql](../supabase/migrations/20260725150000_marketplace_transaction_integrity.sql),
`data_order_records.source_user_id` is the same.

The consequence is that after a user deletes their account, their issued credentials survive with the
claims intact, and their contributed records survive with the payload intact. Both hold personal data
about a person who has asked to be erased. Under GDPR Article 17 that is a defect rather than a design
choice, and it is the kind a regulator finds quickly because the schema states it plainly.

Separately, nothing enforces retention. Expired consent requests, expired share tokens, old
notifications, and export snapshots past `export_expires_at` all persist indefinitely, and
`retention_days` on a pool is advisory.

Stories.
- As a user, I want deletion to mean deletion, and to receive evidence of it.
- As the operator, I want retention enforced automatically rather than by intention.

Scope. A deletion manifest naming every table holding personal data and its required behaviour. Explicit
cleanup for rows that do not cascade. Retention jobs on the LD-601 runner. Third-party cleanup. Evidence
of deletion for the user.

Implementation.
- Write the manifest first, and derive both the code and the tests from it, so a new table cannot be added without a deletion decision.
- Replace reliance on cascades with an explicit, ordered deletion that handles credentials and order records, either by removing them or by irreversibly stripping personal fields where a record must survive for financial or audit reasons.
- Add retention jobs for expired requests, shares, notifications, and export snapshots, and enforce pool `retention_days`.
- Delete or restrict the connected Stripe account on deletion, and record what remains with a payment provider under its own legal retention.
- Issue a signed deletion receipt to the user, reusing the LD-303 signing path.

Security.
- Where a record must survive, such as a financial transaction, strip it to non-identifying fields rather than leaving it linked by a nulled key. A nulled foreign key beside an intact payload is not anonymization.
- Deletion must be verified rather than assumed. A post-deletion check should confirm no personal data remains for that user.
- The audit chain must survive deletion in a verifiable state, since it is evidence for other parties.

Acceptance criteria.
- [ ] A deletion manifest exists covering every table with personal data.
- [ ] After deletion, no issued credential retains claims about the deleted user.
- [ ] After deletion, no order record retains a payload attributable to the deleted user.
- [ ] A test enumerates every table and asserts no residual personal data for the deleted user.
- [ ] Retention jobs purge expired requests, shares, notifications, and snapshots.
- [ ] Pool `retention_days` is enforced rather than advisory.
- [ ] The connected payment account is deleted or restricted, and remaining provider-side data is disclosed.
- [ ] The user receives a signed deletion receipt.
- [ ] The audit chain remains verifiable after a deletion.

Tests. An enumeration test over the full schema asserting no residual personal data. A retention job test
per category. A chain verification test after deletion. A test that adding a table without a manifest
entry fails.

---

### LD-608 Versioned client API

Priority: P0. Effort: medium. Depends on: none.

Rationale. Mutations run through Next.js server actions, and only the web app can call those. The mobile
app, the extension, and partner integrations need a stable HTTP surface. The service layer already holds
the logic, so the API can stay thin.

Scope. `app/api/v1/` handlers for the profile and key salt, vault entries, sources and the sealed ingest
queue, consents, requests, credentials, audit, notifications, and account deletion with step-up. An
OpenAPI document generated from the same Zod schemas.

Implementation.
- Authenticate with `Authorization: Bearer <Supabase access token>`, checked with `auth.getUser`. Create the request's Supabase client with the person's token so row level security applies. Never use the service role for these reads and writes.
- Validate input with the schemas in `packages/core/src/validations/`. Vault writes require `client_ciphertext`, `encrypted_dek`, and `dek_salt`.
- Return `UserFacingError` messages as a JSON error body with a 4xx status, and keep every other error generic, matching the server action rule.
- Publish `/api/v1/openapi` the way [packages/core/src/validations/org-api.ts](../packages/core/src/validations/org-api.ts) feeds `/api/org/openapi`.
- Add `/api/v1` to the middleware allowlist; the handlers authenticate.

Security.
- Rate limit with the LD-109 limiter.
- No endpoint accepts a user id from the caller.
- CORS stays closed. Native apps do not need it, and the extension uses its host permission.

Acceptance criteria.
- [x] A missing or invalid token returns 401.
- [x] A request for another person's data returns nothing, because row level security refuses it rather than a check someone could forget.
- [x] The OpenAPI document matches the Zod schemas.
- [x] Server actions and v1 handlers call the same service functions.

Tests. Auth and ownership tests per resource. An OpenAPI snapshot. A test that a `UserFacingError`
message survives and an internal error does not.

Progress, 2026-10-08.
- `/api/v1` has 49 operations in 40 route files: the profile and key salt, vault entries one at a time or up to 100 in a batch, sources and the sealed ingest queue, consents, consent and credential requests, held credentials and their exports, shares, the audit log with a chain check, notifications, legal acceptance and health consent, recovery, step-up, and account deletion. Recovery, legal acceptance, and health consent were not in the scope list, but a client cannot store anything without them. LD-105 refuses a new vault's first entry until recovery is set up or declined, and LD-110 refuses health data until the person agrees.
- Every handler is wrapped in `v1()` in [lib/api/v1/handler.ts](../lib/api/v1/handler.ts). It checks the token with Supabase Auth, refuses a session on the revoked list or one that skipped a verified second factor, allows 120 calls a minute per person, and runs the handler with the token held in an `AsyncLocalStorage` context. Inside that context `createClient()` sends the token instead of cookies, so the services behind the web app serve the API unchanged and row level security judges both.
- No v1 handler uses the service role, and a test fails the build if one does or reads a user id from the request. The services still use it where a read crosses people or the server owns the write: organization names on a request, credentials issued to an address before they are claimed, publishing the ingestion key, and step-up grants.
- Logic that sat in server actions moved into services so that both surfaces call one function: listing and answering consent requests, the ingestion key and queue, held credentials, holder shares, step-up, and confirmed account deletion.
- `UserFacingError` gained codes that map to statuses. `not_found` is 404, `conflict` and `recovery_required` are 409, `health_consent_required` is 403, `rate_limited` is 429, and any other refusal is 400. Invalid input is a 400 that lists each field and what was wrong with it. Anything else is logged and returned as a generic 500. A path id that is not a UUID is a 404 rather than a database error.
- The OpenAPI 3.1 document at `/api/v1/openapi` is built from the schemas the handlers parse with. A test checks that every documented operation has a route and every route is documented, and a snapshot of the whole document puts any change to the contract in front of a reviewer.
- 10 Playwright tests run the API against a real local stack. A second person's token reads nothing even when it asks the database for the row directly, a step-up proof works once and never from the session that sends it, and an account deleted through the API returns a verified receipt and stops its token working.
- An independent review before merge found two defects, both fixed with tests. The batch endpoint reported a record identifier sent without its provider as a server fault worth retrying, because only the service checked that rule. The request schema now checks it, so the whole request gets a 400 that names the field. Updating or deleting an entry through the API first looked it up with the function that records a read, so every change left a false "accessed" line in the person's audit log. The update and delete services now check that the entry exists themselves and record nothing extra.
- Moving the code found a defect. Confirming a recovery factor by an id that matched nothing still marked recovery as confirmed and wrote an audit entry saying so, which reset the reminder to check that a factor still works. It now returns not found, with a regression test.
- The recovery fixes later the same day added `GET /api/v1/recovery/material` and `POST /api/v1/vault/rewrap`, which brings the API to 51 operations in 42 route files. A device can now change its password or recover a vault through the API, with Supabase Auth changing the password itself. Listing and ending sessions are not in the API yet.

---

### LD-609 Shared core package

Priority: P0. Effort: medium. Depends on: none.

Rationale. The mobile app needs the key derivation, envelope encryption, sealed box, schemas,
validation, privacy classification, and normalizers the web app uses, with no drift between the two.
That code sits inside the Next.js package, next to server-only modules.

Scope. Move the pure modules into `packages/core` in an npm workspace, keeping the web app at the
repository root to limit churn. Leave re-exports at the old paths and remove them over time.

Implementation.
- Candidates: the browser crypto in `lib/crypto/` (not the server signing modules), `lib/schemas/`, `lib/validations/`, `lib/privacy/`, the `lib/connectors/` normalizers, `lib/vault/import-parsers.ts`, and `lib/vault/adapters/`.
- An ESLint boundary rule that forbids `next/*`, the Supabase server clients, and Node-only modules inside the package.
- Point the build-gate tests that read `lib/crypto/` and the schema files at the new paths.

Acceptance criteria.
- [x] Typecheck, lint, unit tests, and the production build pass with no change in behaviour.
- [x] The package imports nothing from Next.js or the server.
- [x] The trust-disclosure, classification, and deletion-manifest gates still fail when they should.

Tests. The existing suite, plus the boundary rule in CI.

Progress, 2026-10-08.
- `packages/core` is an npm workspace named `@luciddata/core`. It ships TypeScript source, which the web app compiles through `transpilePackages`, so there is no build step to keep in step. It holds 30 modules and their 15 test files, moved with their history: the browser crypto, the schema registry and form fields, every Zod schema, the field classification, the import parsers and provider adapters, the fitness normalizers, and the rights deadline engine.
- Two candidates stayed in the web app. `lib/privacy/k-anonymity.ts` and `differential-privacy.ts` are the server's release gate, and one needs Node's random source, so neither belongs on a phone. The export module was split: building the JSON-LD document moved, and saving it as a file, which needs the DOM, went to `lib/utils/download.ts`.
- Imports were rewritten rather than left as re-exports at the old paths. With two paths to one module, a test that mocks the old path does not intercept code that imports the new one, so the suite would quietly test something other than what runs. A script resolved every import against where its file used to live, rewrote 114 of them, and found none inside the package that reached out of it.
- ESLint refuses Next.js, React, the Supabase clients, Stripe, Node built-ins, and the `@/` alias inside the package, and the `window`, `document`, `process`, and `Buffer` globals. A test catches what a name cannot: a relative path that climbs out of `src/`, and a bare import the package does not declare. Both were checked by planting violations.
- The trust centre now prints each crypto module's real path, and its gate scans both crypto folders. It also asserts that every module handling a key the person holds lives in the shared package, which is the property the phone app depends on. Each of the three gates in the criteria was checked by planting an undisclosed module, an unclassified schema field, and an undeclared table.

---

### LD-610 Production hardening and observability

Priority: P0. Effort: medium. Depends on: none.

Rationale. Production runs on Vercel Hobby, which Vercel limits to non-commercial use and to daily cron
jobs, and on a Supabase plan without leaked-password protection. Supabase Auth's built-in email service
only delivers to the project's own team, at a few messages an hour, so password reset for real users
depends on custom SMTP. There is no CAPTCHA and no staging environment. Migrations are applied by hand,
errors go only to the console, and nothing measures the success metrics in section 6. A product holding
health data also needs backups that have been restored at least once.

Scope.
- Vercel Pro and Supabase Pro, with backups and a tested restore.
- Custom SMTP for Supabase Auth through the existing Resend domain, and Cloudflare Turnstile on sign-up, sign-in, and password reset.
- A staging Supabase project, preview deployments pointed at it, and migrations applied by a GitHub Action: to staging on merge, to production on approval.
- `supabase db reset` and `supabase db lint` in CI, plus a nightly Playwright run against a local stack.
- Error reporting through [lib/services/error-logger.ts](../lib/services/error-logger.ts) that scrubs bodies, query strings, email addresses, and health fields.
- Cookieless first-party analytics for the measures of success, and no third-party pixels on signed-in or health pages.

Non-goals. Session replay, which would capture plaintext the browser has just decrypted.

Security. Every new vendor is a subprocessor and goes on the trust centre in the same change, which the
existing assurance tests check.

Acceptance criteria.
- [x] A password reset email reaches an address outside the project team.
- [x] A scripted sign-up without a CAPTCHA token is refused.
- [x] A preview deployment cannot reach production data.
- [x] A migration reaches production only through the workflow.
- [x] An error event contains no query string, email address, or health field, asserted by test.
- [x] The section 6 metrics can be measured from the analytics data.
- [x] A restore drill has run, and its date and result are published under LD-107.

Tests. Scrubber unit tests. The nightly e2e run. A workflow dry run against staging.

Progress, 2026-10-05.
- Vercel is on Pro at $20 a month, so the cron now runs hourly instead of daily. Supabase is on Pro at $25 a month, with the spend cap on. The production database moved from Nano to Micro compute, which a paid organization is billed for either way, and which the plan's compute credit covers.
- Leaked-password protection is on. Supabase rejects a password found in known breaches at sign-up and on change, and the app shows Supabase's message.
- `errorLogger` had been dropping every production event, because its production branch was a TODO. It now writes one scrubbed JSON line per event to the runtime logs. The scrubber removes email addresses, query strings, bearer tokens, JWTs, and long opaque tokens such as share links, and redacts any metadata that is not an identifier, a count, or a known descriptive field.
- Preview deployments held the production service-role key and the issuer key secret. Both are now limited to production. Previews still read the production URL and anon key, which are public, so the preview criterion stays open until previews point at a staging project.
- Vercel Web Analytics runs through a small first-party loader instead of the `@vercel/analytics` package, whose optional peer dependencies conflict with npm 11. It runs only on the production deployment, counts public marketing and sign-in pages, and strips query strings and fragments. Signed-in pages, share links, and invitations are never sent.
- CAPTCHA reaches further than the sign-up form. Supabase checks it on every password sign-in, and the app re-checks passwords that way for step-up confirmation, password changes, and recovery code and factor management. Every one of those calls now sends a Cloudflare Turnstile token when the deployment has a site key. The widget stays invisible unless Cloudflare needs the visitor to interact, and a token is used once. If the check cannot finish within 15 seconds, the request goes without a token and Supabase decides, so a challenge that a browser blocks cannot freeze the form. That case was found on production within the hour and fixed the same day. When Supabase refuses a request for a missing or failed check, the person is told to reload and, if it repeats, to allow `challenges.cloudflare.com`, instead of seeing Supabase's raw error. Supabase has enforced CAPTCHA since 2026-10-05. A scripted sign-up with no token is refused with `captcha_failed` and creates no account, and a forged token is refused with `invalid-input-response`, which shows Cloudflare accepted the stored secret. Preview deployments have no site key, so they use the staging project, which does not ask for CAPTCHA.
- Step-up confirmation used to send the password to a server action, which signed in on the server. That put the password and the key salt in the same place, which the trust centre says never happens. The browser now signs in with Supabase directly and sends only the fresh session's access token. The server accepts it if Supabase validates it, it belongs to the same person, its `amr` claim shows a password sign-in in the last two minutes, and it is not the session making the request. The server then deletes that session, so each proof works once.
- The service worker cached every cross-origin response for an hour, which would have included Turnstile's script, which Cloudflare forbids caching, and Supabase responses about the signed-in person. Cross-origin requests now always go to the network.
- Production's migration history did not match the repository. The 46 migrations had been applied by a tool that recorded them under the time they were applied, not under their file versions, so `supabase db push` would have tried to run all 46 again. Before repairing it, the SQL production ran was compared with each file: 21 were identical and the other 25 differed only in comments added later. The records were then re-versioned in one transaction that required exactly 46 rows, and production's history now matches the repository. Only the tracking table changed.
- The Supabase GitHub integration had "Deploy to production" switched on for `main`. Its one attempt, when it was connected in July, failed on the old history, which hid the setting. With the history repaired, the next merged migration would have reached production with no staging step and no approval. The setting is off until the migration workflow replaces it. Nothing in the repository used its other deploys: there are no Edge Functions and no storage buckets in `config.toml`.
- A staging project, `LucidData Staging` in us-west-2 on Micro compute at about $10 a month, now backs every preview deployment. All 46 migrations were applied to it from `main` and recorded in its history, and its schema matches production on columns, constraints, policies, functions, grants, triggers, indexes, and the realtime publication. Preview deployments get their own Supabase URL, anon key, service key, and issuer key secret, and the shared variables are production only. Staging matches production's password rules and confirms sign-ups automatically. It has no custom SMTP, so Supabase's built-in mailer only reaches the project team, and no CAPTCHA, because previews have no Turnstile site key. A sign-up through a preview deployment created its account, key salt, and recovery factor in staging and nothing in production, which closes the preview criterion. Previews can sign in again.
- A validation pass after these changes found three more problems. Supabase's redirect allowlist still held wildcard `*.vercel.app` patterns, and Supabase's `*` matches any name, so a stranger's Vercel project could receive a password-reset link once reset emails began reaching real people. The allowlist is now exactly `https://luciddatabank.com/recover-vault`, and a reset link that asks for any other address points back to the site instead. Separately, `/login` and `/two-factor` sent people to whatever `redirectedFrom` held after sign-in, including another site; both now accept only a path on this site. Last, the old service worker left its cross-origin cache in place on existing devices, and the new worker deletes it when it starts.
- Supabase Auth still pointed at `lucid-data-lucid-data.vercel.app` as its site URL, and `luciddatabank.com` was missing from the redirect allowlist, so password-reset links that ask to return to `/recover-vault` fell back to the old address. The site URL is now `https://luciddatabank.com`, the domain is on the allowlist, and the server-side minimum password length is 8, matching the app's own validation.
- Supabase auto-confirms sign-ups, so nobody has proved they own their email address. That matters here, because credentials, credential requests, and consent requests are matched to accounts by email. Confirmation needs custom SMTP first, and a registration flow that sets the key salt and recovery code on the first confirmed sign-in rather than straight after sign-up. Recorded as an open defect in section 9.
- Custom SMTP is live. Supabase Auth sends through Resend as `LucidData <noreply@luciddatabank.com>`, with its own sending-only key scoped to the domain, and the limit is 30 emails an hour instead of 2. A reset email to a test address that is not on the project team was delivered, which closes the first criterion. Email confirmation is the next step, and it needs the registration change above.
- Migrations reach the hosted databases only through `.github/workflows/migrations.yml`. A merge that touches `supabase/migrations` applies them to staging, then to production once the owner approves the `migrations-production` environment. Only `main` can deploy to either environment, and administrators cannot skip the approval. Each job holds only its own database password, both rotated for this and stored nowhere else, and connects through the session pooler with the server's certificate and host name checked against Supabase's root CA. The CLI's default checks neither, so the workflow sets `verify-full`, and a local test confirmed the CLI then refuses a wrong CA and a wrong host name. The first run found both databases up to date, which closes the migration criterion.
- CI builds a database from every migration on each pull request, lints it with `supabase db lint`, and runs pgTAP tests: row level security on every public table, `search_path` pinned on every `SECURITY DEFINER` function, none of them callable by `anon`, a reviewed list callable by signed-in users, and a table privilege behind every policy for signed-in users. Each test failed against a deliberate violation before it was kept. The Playwright suite runs nightly against a production build and a local Supabase stack, and its first run passed.
- Spending is capped below the owner's limit of $150 a month. Vercel's on-demand budget is $60 and pauses production when it is reached, and Supabase's spend cap is on. The committed total is about $60 a month and the worst case about $120; [AGENTS.md](../AGENTS.md) keeps the table.
- The first restore drill ran on 2026-10-06. The previous day's physical backup of production was restored into a new, temporary project, which was healthy four minutes after the request. All 44 tables matched production by row count and a hash of every row, as did both accounts, all 46 migration records, and the head of the audit hash chain; the one difference was the 56 hourly scheduler rows written after the backup. The restored project answered on its own API, and was deleted after about five minutes, at a cost of under a cent. The result is published at `/trust/assurance`, which also stopped claiming point-in-time recovery: it is a paid add-on that is not enabled, so a restore returns the database to the last daily backup.
- The section 6 measures can be read from first-party data, which closes the last criterion. A database function, `product_metrics`, works them out for any period from rows the product already keeps, and only the service role can call it. The hourly scheduler stores one snapshot per week in `metric_snapshots`, rewriting each of the last six weeks once a day so the thirty-day measures can mature, then leaving the week alone. Sharing and credential presentations are counted from the audit log, not from share rows, because share rows are purged 30 days after they lapse and a count built on them would shrink as the week got older. Two facts were missing and are now recorded. `users.signup_source` holds `verify` or `extension` when the person arrived from a credential check or the extension, set once at sign-up from an allowlist the database enforces, and `direct` otherwise. `pool_evaluations` records which organization looked at which of its own pools, so buyer conversion has a denominator. The trust centre says what is measured and how. Until LD-611 gives the measures a screen, read them in the SQL editor with `select * from metric_snapshots order by period_start desc`.
- Three measures still come from somewhere else. Extension installs come from the store dashboards, because the extension reports nothing to us; saving a tracker summary to the vault is counted as the visible part of tier 1 enablement. Timeline visits per week wait for LD-214, which builds the timeline, and that spec now carries the counter.
- The redirect allowlist fix from 2026-10-05 did not hold. On 2026-10-07 production's allowlist again held `https://lucid-*-data-lucid-data.vercel.app/**` and three related entries. The cause is the Supabase Vercel integration, which Supabase documents as rewriting the auth redirect URLs whenever Vercel reports a deployment. Production never needs a Vercel address there, because previews use the staging project, so the integration's project connection was deleted on 2026-10-08. Deleting it also removed every variable the integration had written to Vercel, despite the confirmation dialog saying they would stay. The app reads only one of them, `SUPABASE_SECRET_KEY`, which was recreated as an ordinary production variable before the next deploy. The others, including the unused `SUPABASE_JWT_SECRET` and the `POSTGRES_*` connection strings, are gone, which also takes those secrets out of Vercel. The next production deployment served the service-role paths normally and left the allowlist at the one recovery URL. Vercel variables are now set by hand, and AGENTS.md says not to reconnect the integration.
- Production confirms email addresses since 2026-10-08, which closes the open defect in section 9. Registration used to sign in straight after sign-up and set the key salt and recovery code there, which cannot work once Supabase withholds the session until the address is confirmed. Now sign-up shows a check-your-email screen, and the first sign-in after confirming sets the vault up, because that is when the password is next in hand. The confirmation email links to `/confirm-email`, which confirms only when the button is pressed, so a mail scanner that opens the link does not use it up. The token is verified on a server-side client that keeps nothing, and the session it creates is ended at once: confirming an address is not signing in. The salt is claimed through a server action that stores it only if none is set and returns whichever is stored, and since migration `20261008024818` the database refuses to change a salt once it is set, for every role. `PATCH /api/user/profile` no longer accepts one. Previews and local development still confirm automatically, and registration there sets the vault up immediately, as before.

---

### LD-611 Operator console and webhook management

Priority: P1. Effort: medium. Depends on: LD-301, LD-506, LD-602.

Rationale. Section 6.6 records service functions with no screen: advancing a rights case (pause,
resume, extend, resolve), releasing a held payout, and registering an organization webhook. Until they
have one, an operator acts through the service role by hand, which is what LD-605 exists to stop.

Scope. An operator console behind a separate role, for rights cases, payout holds, and abuse reports. A
webhook management page in the organization portal for owners.

Implementation.
- An operator role checked in the server action, never inferred from an email domain.
- Every operator action writes an audit entry naming the operator, and LD-605 attribution applies.
- Webhook management calls the existing `createWebhook`, keeps its SSRF guard, shows the signing secret once, and supports rotation and deletion.

Security. A person can never advance their own rights case or release their own payout hold, asserted by
test.

Acceptance criteria.
- [ ] An operator can pause, resume, extend, and resolve a rights case, each with a stated reason.
- [ ] An operator can release a held payout, with a reason.
- [ ] An organization owner can add, rotate, and remove a webhook endpoint.
- [ ] Every operator action is audited with the operator's identity.

Tests. Role checks, self-action refusal, and the webhook lifecycle.

---

### LD-612 Consumer subscription

Priority: P1. Effort: small. Depends on: LD-110.

Rationale. Section 7.4 finds consumer subscriptions are the largest revenue line in the sustainable
scenario, and [lib/constants/billing-plans.ts](../lib/constants/billing-plans.ts) offers individuals
nothing. The health focus draws a clear line between free and paid.

Scope. A free tier and one paid tier at about four dollars a month. A proposed split, to confirm: free
covers manual entry, file import, and one connected source; paid covers every source, full history
backfill, health summary sharing, and later account continuity under LD-104.

Implementation.
- Stripe Billing for individuals, following the patterns in [lib/services/stripe-billing.service.ts](../lib/services/stripe-billing.service.ts). A new table needs row level security and a deletion-manifest entry.
- The iOS app links out to web checkout on the US storefront, which Apple guideline 3.1.1(a) permits there, subject to open decision 13.

Acceptance criteria.
- [ ] A person can subscribe, change plan, and cancel on the web.
- [ ] Limits are enforced on the server, never only in the interface.
- [ ] Cancelling never deletes data. It stops syncs beyond the free limit.

Tests. Plan limit tests, webhook-driven state changes, and a cancellation test.

---

## 6. Sequenced roadmap

Sequencing is driven by dependencies and by the fact that trust and acquisition gate everything else.

### Phase 1, months 1 to 3. Make the claim credible and the vault non-empty

**Status: delivered 2026-07-26.** All eleven specs are implemented and verified. The per-spec record,
including the two acceptance criteria that could not be met and why, is in
[section 6.1](#61-phase-1-delivery-record).

- LD-102 production notification delivery
- LD-101 trust centre and key custody disclosure
- LD-303 signed consent receipts
- LD-601 scheduled job runner
- LD-603 organization team management
- LD-109 platform abuse controls
- LD-302 universal opt-out signal
- LD-105 recovery hardening
- LD-106 session security and at-risk protections
- LD-406 issuer key lifecycle and compromise response
- LD-505 marketplace pricing and platform fee

Exit criteria: a new user cannot create a vault they will irreversibly lose, only real organizations can contact users, an organization can add colleagues, a compromised issuer key can be contained, and no marketplace sale loses money.

**Exit criteria met.** The one criterion the phase heading claims but the phase does not deliver is a
non-empty vault: that is LD-201, which the capacity rebalance moved to phase 2. The heading is left
unchanged for traceability, but read the exit criteria rather than the heading.

Sequencing note. LD-303 and LD-601 have the highest fan-out in the whole plan, blocking five and three
other specs respectively, so they should start first regardless of their individual priority. LD-107,
LD-201, and LD-501 were moved to phase 2 because the capacity analysis showed phase 1 at roughly double
a two-engineer team's throughput. LD-505 stays here despite being unglamorous, because every spec that
increases marketplace volume makes the current pricing worse.

### 6.1 Phase 1 delivery record
Verified on 2026-07-26: typecheck clean, lint clean at `--max-warnings=0`, 567 of 567 Vitest tests
(up from 470), production build green across 45 routes, and 57 of 57 Playwright specs with retries
disabled. Ten migrations were applied to the local database. **They have not been applied to
production.** See [section 6.3](#63-deployment-prerequisites) before shipping.

| Spec | Delivered | Notes worth carrying forward |
|---|---|---|
| LD-102 | Yes | Deep links already existed, so the work was failure logging and visibility. Delivery failures now log through the error logger with no recipient, subject, body, or token in the entry. `isEmailDeliveryConfigured()` drives a warning in the org portal when no transport is set. A transport still has to be configured per deployment; the code is ready, the secret is not set |
| LD-101 | Yes | [lib/constants/trust-disclosures.ts](../lib/constants/trust-disclosures.ts) is the single source. A Vitest test fails the build if any module in `lib/crypto/` or `packages/core/src/crypto/` has no key-custody entry, which makes the page self-maintaining rather than a document that rots |
| LD-303 | Yes | Receipts are append-only and chained by `supersedes_receipt_id`. A new `platform_keys` table holds the receipt signing key under the same custody model as issuer keys. **This makes `ISSUER_KEY_SECRET` required for consent, not just credential issuance** |
| LD-601 | Yes, with one criterion unmet | Jobs: payout retries with exponential backoff, consent expiry, share expiry, rate-limit purge. **Connector token refresh was not implemented** because there is no `data_sources` table until LD-201. The runner has a job registry so it slots in without restructuring |
| LD-603 | Yes | Single-use hashed invitation tokens bound to the invited address. Last-owner protection on both demote and remove. This is the first time the owner / issuer_admin / verifier / member role model has been reachable at all |
| LD-109 | Yes | Organization registration now requires a session and issues no API key; keys come only after domain verification. `assertIssuanceQuota` moved inside `issueCredential` so no path bypasses it. Rate limiting is Postgres-backed and fails open with a log rather than taking the product offline |
| LD-302 | Yes | Signal recorded once and audited once, from either the header or `navigator.globalPrivacyControl`. A deliberate opt-in afterwards is recorded as a distinct event so it is never confused with the signal going away |
| LD-105 | Yes | Two independent factors: the printed recovery code and a downloadable recovery kit. The first-write block only fires when recovery setup actually failed, because registration already enrolls a code. That is the intended safety net rather than a new speed bump. **Corrected 2026-10-08:** until then the kit could not open the vault, because recovery read only the code's escrow, and every factor stopped working after a password change while settings still listed it. See the defects in section 9 |
| LD-106 | Yes | Idle lock clears the key itself, not a flag. Step-up grants are single use, expire in 120 seconds, and name one action, so a confirmation cannot be reused. Session listing and revocation run through `auth.uid()`-scoped `SECURITY DEFINER` functions because PostgREST does not expose the auth schema. **Corrected 2026-10-08:** only account deletion and session revocation checked a grant. Export, password changes and recovery, and every change to recovery factors now need one too. Consent withdrawal stays one step on purpose |
| LD-406 | Yes | `verifyIssuedCredential` now selects the key by the credential's `key_id` rather than by whichever key is active, so rotation no longer invalidates history. The result shape changed to `{valid, reasons, warnings}` |
| LD-505 | Yes, with one mechanism substituted | 25% platform fee, $50 minimum order enforced in both the service and a database constraint, $25 payout threshold with the balance paid out on account closure. `interests` and `other` were repriced off a zero access fee. Profitability is asserted by a table-driven test across eight pool sizes and every category |

Two acceptance criteria were not met as written. Both are recorded here rather than quietly dropped.

1. **LD-601, connector token refresh.** Blocked, not skipped. There is no `data_sources` table to
   refresh tokens for. Add the job to `JOB_NAMES` in
   [lib/services/scheduled-jobs.service.ts](../lib/services/scheduled-jobs.service.ts) as part of LD-201.
   **Closed by LD-201 on 2026-07-26, and not in the way this note expected.** Refresh happens inside
   `connector_sync`, immediately before each provider fetch, rather than as a job of its own. A token
   refreshed on its own schedule can still expire in the gap before it is used, so refreshing at the
   point of use is the stronger design as well as the simpler one.
2. **LD-505, `application_fee_amount`.** The spec instructed taking the fee with Stripe's
   `application_fee_amount`. That parameter does not exist on separate charges and transfers, which is
   the model LucidData uses. The fee is instead the difference between the gross the buyer paid and the
   net transferred, with `gross_cents`, `platform_fee_cents`, and `fee_bps` all recorded on the payout
   row and all three shown to the contributor before consent and at payout. This satisfies the
   acceptance criterion, which asks that the contributor see gross, fee, and net. It does not satisfy
   the implementation instruction, which assumed an unavailable mechanism.

One implementation decision went beyond the spec and is worth a review. The fee rate is **pinned per
contribution** in `pool_contributions.platform_fee_bps` at consent time. That is the reading of "a fee
change does not retroactively alter existing contributions" that costs money if the fee ever rises,
because old contributions keep earning at the old rate. The alternative reading, applying the current
rate to every future sale, is cheaper and defensible, but it means the terms someone agreed to can
change without them agreeing again. If product prefers the cheaper reading, change it before volume
accumulates, not after.

### 6.2 Implications for later phases

Phase 1 changed foundations that later specs were written against. Read this before starting any phase
2 spec. Each item names the spec it affects.

**LD-201 connector framework, phase 2.**
- The trust-disclosure test asserts that every crypto module has a key-custody entry. Adding `packages/core/src/crypto/ingestion-keys.ts` **will fail the build** until [lib/constants/trust-disclosures.ts](../lib/constants/trust-disclosures.ts) gains a matching entry in the same pull request. This is intended: the spec already requires disclosing `CONNECTOR_TOKEN_SECRET` as a server-held key, and the test now enforces it.
- Token refresh is a scheduled job, not new infrastructure. Register it in `JOB_NAMES` and it is picked up by the existing cron endpoint, backoff, and run history.
- Sync failures should raise notifications through the LD-102 path, which now logs delivery failures rather than swallowing them.

**LD-501 anonymization, phase 2.**
- The economics inverted. Under the old fixed access fee, larger cohorts lost money, so k-anonymity fought the business model. Under the 25% fee, larger cohorts earn more, so the privacy gate and the revenue model now point the same way.
- A release refused by the k-gate must not leave a paid order behind. The order path now enforces a $50 minimum and a matching database CHECK, so the refusal has to happen before the Stripe Checkout session is created, not after payment.

**LD-607 deletion completeness, phase 2.**
- The deletion manifest must cover the tables Phase 1 added: `consent_receipts`, `recovery_factors`, `step_up_grants`, `revoked_sessions`, `org_invitations`, and the new fee columns on `payouts`.
- `rate_limit_counters` stores bucket keys that embed user and organization ids. It is a retention item, not just a cache. The LD-601 purge job already drops windows older than a day, which is the behaviour LD-607 should formalize rather than replace.
- `deleteAccount` now pays out any owed balance before deleting, per LD-505. LD-607's explicit ordered deletion must preserve that step, and must run it before the account rows disappear.
- `job_runs` holds no personal data and can be excluded, but say so in the manifest rather than omitting it.

**LD-602 organization developer surface, phase 2.**
- **The org API contract changed and the OpenAPI document must describe the new behaviour, not the old.** `POST /api/org/register` requires a session and no longer returns `api_key`. `POST /api/org/consent-request` returns `202` with a fixed neutral body instead of `201` with the created request. Both are breaking changes for any existing integrator.
- Rate limits exist now, so `429` is a documented response on registration, consent requests, credential requests, issuance, and verification.
- Webhook payloads must respect the same enumeration rule as the endpoints: an event must not confirm that an email maps to an account.

**LD-301 rights engine, phase 2.**
- Use the LD-303 signing path for rights artifacts rather than introducing a second receipt format. LD-607 already assumes this for deletion receipts.
- Rights actions that destroy or export data should sit behind LD-106 step-up, which already covers export and deletion.

**LD-206 tracker transparency, phase 2.**
- The extension's obligation to send Global Privacy Control is already served server side. LD-302 records a `gpc_navigator` source, so the extension only needs to report the signal, not build the recording path.

**LD-405 credential correction, phase 3.**
- The verification precedence list in LD-405 was written before LD-406 shipped. `verifyIssuedCredential` now returns `{valid, reasons, warnings}` and already implements the revoked, compromised, and expired branches. LD-405 must extend that result shape and slot `superseded` into the existing precedence rather than introducing a parallel verification path.

**LD-401 standards formats, phase 3.**
- Verification selects the signing key by the credential's `key_id`. Any new format module must preserve that, or rotation will start invalidating history again. `getIssuerPublicKeyHistory` already publishes retired public keys, which is what an external verifier needs.

**LD-104 account continuity, phase 4.**
- Its dependency on LD-303 is satisfied.
- `recovery_factors` already models exactly what a nominee needs: an independently wrapped copy of the master key that the server cannot open. Extend that table with a nominee factor type rather than building a parallel escrow.

**LD-605 insider controls, phase 3.**
- The service-role wrapper it proposes now has more call sites than when it was written, because rate limiting, step-up, session revocation, and org team management all use the service role. Scope the wrapper accordingly.
- `job_runs` gives scheduled work a provenance record that the attribution work can reuse.

**LD-502 governed access, phases 3 and 4.**
- The fee model is per-record and pinned at consent. Recurring governed access is not a per-record snapshot, so it needs its own fee decision. This is unresolved and should be settled with open decision 10 rather than assumed.

### 6.3 Deployment prerequisites

Phase 1 introduced hard requirements that will cause user-visible failures if a deployment misses them. All five are now satisfied in production; the list is kept because it is what a fresh environment still has to meet.

1. **`ISSUER_KEY_SECRET` is now required for consent, not only for credential issuance.** Every consent grant, extension, and revocation signs a receipt with a platform key wrapped by this secret. If it is unset, granting consent throws. Verified set in production on 2026-07-26.
2. **`CRON_SECRET` must be set or no scheduled job runs.** The cron endpoint fails closed by design, so an unset secret rejects every request. It was missing in production and was set on 2026-07-26; before that, nothing scheduled could have run even once the code was live.
3. **Migrations must be applied before the code that uses them.** All sixteen Phase 1 and Phase 2 migrations are applied to production. Every one was additive, which is why production kept working while it ran an older build.
4. **LD-109 is a breaking API change.** Any integration that registers organizations programmatically, or that reads `api_key` from the registration response, will break. Migrate integrators before applying the change set.
5. **An email transport should be configured.** The code path is complete and the org portal warns when it is not, but with no transport nothing is delivered. **Closed 2026-07-27.** Resend carries application notifications from `luciddatabank.com`, with SPF on a `send.` subdomain so the Zoho record at the apex is untouched. Worth remembering for any future secret: Vercel captures environment variables into a deployment rather than reading them live, so adding the key changed nothing until the next build.

### 6.3.1 The deployment outage, and what caused it

Between 2026-07-26 and the fix on the same day, five commits reached `main` and none of them deployed. Production served a build that predated Phase 1 entirely. Nothing broke, because every migration was additive and the old code simply ignored the new columns and tables, but none of the work was live either. Two independent faults were responsible and both are worth recording, because each on its own is silent.

**The Git link was sourceless.** The Vercel project carried the repository metadata, the correct production branch, and a credential id, but `link.sourceless` was `true`. In that state Vercel knows which repository the project belongs to and still does not subscribe to its pushes, so a commit produces no deployment and no failed deployment. There is nothing in the deployment list to notice. `vercel git connect` reported the repository as already connected and changed nothing; disconnecting and reconnecting cleared the flag.

**The cron schedule exceeded the plan.** `vercel.json` asked for `*/15 * * * *`, and the Hobby plan permits daily crons only. This fails at deployment creation rather than during the build, so it would have blocked every deployment even after the Git link was repaired.

Three changes came out of it.

- The schedule is now `0 3 * * *`. Daily is right for retention, expiry marking, and counter purging, which are housekeeping.
- Daily is not right for webhooks, so `enqueueEvent` now dispatches through `after()` once the response has been sent. Deliveries go out in seconds and the daily sweep is the retry net rather than the delivery mechanism. This is better than the 15-minute cron would have been.
- A deployment is not finished when a push succeeds. Confirm the commit SHA is live before treating a phase as shipped. The check that caught this was requesting `/trust` and finding a 307 to `/login`, which meant the deployed middleware predated the allowlist that made the trust centre public.

If sub-daily payout retries become necessary, the options are a Pro plan or a scheduled GitHub Actions workflow calling `/api/cron` with the same bearer secret. The endpoint already supports both; only the caller changes.

### Phase 2, months 3 to 6. Make the marketplace safe and the rights story complete

Status: delivered, with LD-602 delivered in part. Delivery is tracked in [section 6.4](#64-phase-2-delivery-record), and what was deliberately left out is in [section 6.6](#66-what-is-left-in-phase-2).

- LD-107 assurance and procurement pack (delivered)
- LD-602 organization developer surface (delivered in part)
- LD-201 connector framework (delivered)
- LD-501 real anonymization guarantees (delivered)
- LD-607 retention and deletion completeness (delivered)
- LD-301 rights and DSAR engine (delivered)
- LD-202 source health and provenance
- LD-503 buyer evaluation surface (delivered)
- LD-205 extension foundation
- LD-206 tracker transparency and browsing insight
- LD-604 bulk and asynchronous organization operations (delivered)
- LD-108 accessibility conformance

Exit criteria: no release can leave the platform without passing a k-anonymity gate, deletion actually deletes, EU and UK rights handling is defensible, an organization can operate at institutional volume, and a new user gets something useful before contributing any data.

Three of those five criteria are met. The k-anonymity gate is in the purchase path, deletion deletes and proves it, and EU and UK rights handling has a case model, a deadline engine, and an appeal path. Institutional volume needs LD-604, and giving a new user something useful before they contribute needs LD-205 and LD-206.

This phase is also over capacity. LD-108 and LD-604 are the most deferrable if it has to be cut.

### 6.4 Phase 2 delivery record

| Spec | Status | What landed | What did not |
| --- | --- | --- | --- |
| LD-607 retention and deletion completeness | Delivered 2026-07-26 | `lib/constants/deletion-manifest.ts` covers all 36 public tables with a behaviour and a reason, and a Vitest test derives the live table list from the migrations so a new table without a deletion decision fails the build. `lib/services/deletion.service.ts` replaces cascade-only deletion: it deletes issued credentials about the subject, strips `data_order_records` to an empty payload with both source links cleared and `redacted_at` set, deletes invitations keyed by email, deletes rate-limit counters whose bucket embeds the subject id, closes the Stripe connected account, verifies the result with a residue sweep, and signs a deletion receipt. `lib/services/retention.service.ts` adds five purges wired into the LD-601 runner as `retention_purge`. The trust centre publishes both the retention table and the four residual disclosures. | Nothing in scope. Both open defects in section 9 are closed. |
| LD-501 real anonymization guarantees | Delivered 2026-07-26 | `packages/core/src/privacy/quasi-identifiers.ts` classifies every field of all seven built-in schemas as identifier, quasi-identifier, sensitive, or safe, each with a written reason, and a test derives the field list from the Zod schemas so an unclassified field fails the build. `lib/privacy/k-anonymity.ts` does full-domain generalization with ladders for dates, years, numerics, and categories, computes equivalence classes, suppresses records below k, and refuses rather than warns. `lib/privacy/differential-privacy.ts` adds seeded Laplace noise and a per-pool epsilon budget that blocks aggregate release on exhaustion. The gate runs in `startPoolPurchase` before pricing and before Checkout, and every order stores its privacy report. `pool_contributions.schema_type` now travels with each contribution, because a broad data category is not enough to classify a field. | Governed access instead of copies is LD-502 and unchanged. The epsilon budget is implemented and tested but has no aggregate query surface to spend it on yet; that arrives with LD-502. |
| LD-301 rights and data subject request engine | Delivered 2026-07-26 | `packages/core/src/utils/rights-deadlines.ts` is a pure deadline engine covering EU, UK, and California, with calendar-month arithmetic that clamps to month end, permitted extensions, and a clock that stops only where the jurisdiction allows it. `rights_cases` and `rights_case_events` carry the case model and its append-only evidence, with a database trigger that rejects UPDATE and a REVOKE that stops any API-role delete, while still permitting the cascade from an erased account. `lib/services/rights.service.ts` handles file, pause, resume, extend, resolve, withdraw, and appeal; a refusal must state its reason, and an appeal becomes its own case with its own clock. `app/(dashboard)/privacy/page.tsx` is the user surface, linked from both navigations. | There is no operator queue UI. Pause, resume, extend, and resolve exist as service functions with no action or screen behind them, deliberately: a person must not be able to advance their own case, and an operator console is its own piece of work. Verification of identity is not modelled beyond the `verifying` status. |
| LD-107 assurance and procurement pack | Delivered 2026-07-26 | `lib/constants/assurance.ts` is the single source for residency, support severities and response targets, availability, recovery objectives, the incident runbook with named roles and breach templates, processing-agreement positions, continuity, and the standard security questionnaire. Published at `/trust/assurance` and linked from the trust centre. Tests assert that nothing untested is described as tested, that the questionnaire cannot contradict the certification list, that every subprocessor has a stated processing region, that the 72-hour Article 33 deadline survives an edit, and that both sub-pages stay linked from `/trust`. | No countersigned data processing agreement, because that needs legal review, which section 9 still records as not done. The first recovery drill ran on 2026-10-06 and covered the database only, so the hosting and signing-key objectives are still published as design targets and say so. Availability is a target with no measurement and no credit scheme, stated as such. |
| LD-602 organization developer surface | Delivered in part 2026-07-26 | The OpenAPI 3.1 document at `/api/org/openapi` is generated from the same Zod schemas the handlers validate against, which are now shared in `packages/core/src/validations/org-api.ts` so the two cannot drift. It documents the LD-109 breaking changes honestly: registration needs a session and returns no key, and consent-request answers a neutral 202 rather than a 404 that would leak account existence. `lib/services/webhook.service.ts` adds signed outbound delivery: HMAC-SHA256 over `${timestamp}.${body}`, a 300-second replay window, exponential backoff to eight attempts on the LD-601 runner, secrets stored hashed, and an SSRF guard that refuses loopback, RFC 1918, carrier-grade NAT, link-local including the cloud metadata address, IPv6 unique-local, bare hosts, and embedded credentials. Payloads carry identifiers and timestamps only, enforced at runtime by a recursive check and at build time by a test. Consent request answers emit an event instead of forcing the buyer to poll. | No generated TypeScript client and no sandbox mode. Both are real work rather than omissions of convenience: a client needs a package and a release process, and a sandbox needs isolated data that provably cannot read production rows, which is the part worth doing carefully. There is no organization UI for managing webhook endpoints yet; `createWebhook` exists as a service function. |

Notes on LD-607 that affect later work.

- The manifest test is a build gate. Any later spec that adds a table (LD-201 `data_sources`, LD-301 request records, LD-205 extension state) must add a `DELETION_MANIFEST` entry in the same change or the suite fails. That is the intended behaviour, not an obstacle.
- Deletion now returns a signed receipt object rather than `void`. Any caller of `deleteAccount` or `deleteAccountAction` must handle the return value.
- `data_order_records.payload` can now be `{}` with `redacted_at` set. Buyer-facing export code must tolerate a redacted placeholder rather than assuming every record has content. LD-503 buyer evaluation surface and LD-502 must both account for this.
- Retention windows are published on the trust centre, so changing a constant in `lib/constants/retention.ts` changes a public promise. Treat those values as a disclosure, not a tuning knob.
- Audit chains are per user, which is what makes erasure and chain integrity compatible. Any move to a single global chain would break the right to erasure and must not be made without redesigning both.

Notes on LD-501 that affect later work, and one finding that needs a decision.

- **The sellable surface of the marketplace has narrowed, and this is the point.** Unclassified fields fail closed, so a pool of free-form custom-schema fields now releases nothing and the purchase is refused. Crossed with the restricted categories in `packages/core/src/validations/marketplace.ts` (health, financial, location, browsing are not sellable), the only data that can be sold today is the `credentials` category backed by the `employment`, `education`, and `identity` schemas. The marketplace lifecycle e2e was rewritten onto `employment` for exactly this reason. Anyone who wants `interests`, `personal`, or `other` pools to work has to classify those fields first. That is a product decision, not a bug, and it should be made deliberately rather than by weakening the gate.
- Full-domain generalization means the gate rarely refuses once there are at least k records; it generalizes hard instead. A cohort of five people at five different employers is released with employer suppressed and the start date widened to a decade. That is correct and the privacy report says so plainly, but a buyer can still pay for a dataset that generalization has emptied of value. LD-503 buyer evaluation surface has to show the achieved k and the generalization levels **before** purchase, not only after.
- `prepareRelease` is pure and deterministic. LD-502 governed access must call the same function rather than writing a second gate, or the two paths will drift and one of them will be the weaker.
- The epsilon budget exists and is enforced, but nothing spends it yet. LD-502 is where `spendEpsilon` gets wired to a real aggregate query, and it must persist `data_pools.epsilon_spent` rather than holding the budget in memory.
- `data_pools.k_anonymity_target` is clamped so `minimum_contributors` is never lower than it. Any later code that sets one must set the other, or the purchase check will pass a release the privacy gate then refuses.
- Adding a field to any schema in `packages/core/src/schemas/vault-schemas.ts` now requires a classification in the same change, the same way a new table requires a deletion-manifest entry.

Notes on LD-301 that affect later work.

- The next piece of work this needs is an operator console. Pause, resume, extend, and resolve are implemented and tested as service functions with no screen and no server action, because a person marking their own request fulfilled would make the evidence worthless. Until that console exists, an operator has to advance a case through the service role directly.
- `rights_case_events` is append-only in the database, not just by convention. A trigger rejects UPDATE, and DELETE is revoked from the API roles. The one delete that still works is the cascade from an erased account, which is deliberate: the right to erasure outranks our wish to keep evidence about someone.
- Deadlines are recomputed from `received_at`, `extended_to`, and `paused_ms` on every read rather than trusted from `due_at`, so a stored value cannot drift. Anything that writes those columns must keep them consistent.
- There is exactly one deletion path, `account.service.deleteAccount`. A `deletion` rights case tracks the request and its deadline; it does not delete anything itself, because erasure requires step-up re-authentication. The privacy page says so plainly rather than implying otherwise.

Notes on LD-602 that affect later work.

- Organization API request schemas now live in `packages/core/src/validations/org-api.ts` and are imported by the handlers. Adding a field to a handler means adding it to that schema, which changes the published specification in the same commit. That is the mechanism that keeps them honest, so do not reintroduce an inline schema in a route.
- `ORG_API_VERSION` and `WEBHOOK_API_VERSION` are separate on purpose. A webhook payload change breaks a recipient that we cannot redeploy, so it moves independently of the request API.
- The webhook payload allowlist is a runtime guard, not a convention. `assertNoPersonalData` runs before a payload is queued, and the forbidden-key list in `webhook.service.ts` is deliberately broad. Widening a payload means widening that list, which should feel deliberate.
- Delivery signing uses the stored secret hash rather than a plaintext secret, so a database read alone does not hand an attacker a working forgery key. LD-604 and anything else that adds an outbound callback should follow the same pattern.
- ~~The SSRF guard checks hostnames, not resolved addresses.~~ **Closed 2026-07-27.** The name check remains, and delivery now also resolves the host and refuses if any returned address is private, checked at send time rather than at registration because the owner of a name can repoint it after we accept it. Redirects are refused outright, since following one hands the destination choice back to the endpoint and is the cheapest way around the check. One residual risk is stated rather than hidden: this is a check followed by a separate connection, so a name that answers publicly and then privately microseconds later still gets through. Closing that fully means pinning the resolved address into the socket.

| LD-503 buyer evaluation surface | Delivered 2026-07-26 | `lib/services/pool-evaluation.service.ts` shows a buyer what a purchase would actually deliver before they pay: contributor band, record count, per-field coverage, freshness buckets, and a privacy panel reporting the cohort size the release would achieve, how many records would be withheld, and how far each field would be generalized. It calls the same `prepareRelease` the purchase path calls, so a quote cannot disagree with a charge, and `computeOrderTotal` moved into `lib/constants/marketplace-economics.ts` for the same reason. Coverage, freshness, and schema mix come from three Postgres functions that aggregate keys and timestamps without ever returning a contributed value. Samples are invented from the schema by `lib/services/synthetic-samples.ts`, which a test proves cannot even import a repository. | Nothing in scope. Distribution-shape quality metrics were left out deliberately, because the useful ones are themselves disclosive on a small pool. |

| LD-604 bulk and asynchronous organization operations | Delivered 2026-07-26 | `bulk_jobs` and `bulk_job_rows` make the row the unit of work, so one malformed address fails on its own and can be retried without repeating the rest. `lib/services/bulk-job.service.ts` covers issuance, revocation, and consent requests, with a content-derived idempotency key that stops a resumed or double-swept job from issuing twice, cancellation checked between rows so nothing is half issued, and a `retryFailedRows` that touches only failures. Quota runs inside `issueCredential`, so the bulk path cannot spend more allowance than the single one. Jobs start through `after()` and the scheduler is the resume path. Completion and failure emit LD-602 webhooks. | Upload is a JSON paste rather than a file picker with CSV parsing. The row shape and the limits are the hard part and are done; a file reader on top is presentation. |

| LD-201 connector framework with zero-knowledge ingestion | Delivered 2026-07-26 | `packages/core/src/crypto/ingestion-keys.ts` is an ECDH P-256 sealed box: the browser mints a keypair, publishes the public half, and wraps the private half with the master key. `lib/services/connector.service.ts` runs on the LD-601 scheduler, fetches from Strava or Fitbit, normalizes with the existing pure functions, and seals each record to that public key. It writes ciphertext it cannot read, and it refuses to run at all when no ingestion key has been published rather than storing anything readable. `lib/hooks/usePendingIngest.ts` opens the queue after unlock and re-encrypts through the normal vault envelope. OAuth state is HMAC-signed, expires in ten minutes, and is checked against both the session user and the route's provider. Provider tokens are wrapped with `CONNECTOR_TOKEN_SECRET` and refreshed before expiry, and the trust centre discloses that custody. | Only the two fitness providers the repository already had metadata for. Financial connectors stay out while CFPB 1033 is stayed, and health platforms are LD-204. Disconnect revokes upstream for Strava only, because Fitbit has no equivalent endpoint. |

| LD-202 source health and field provenance | Delivered 2026-07-26 | `vault_data` gains `source_provider`, `source_record_id`, and `source_captured_at`. They sit outside the encryption envelope, so both `packages/core/src/validations/provenance.ts` and a pair of database CHECK constraints hold them to identifiers rather than labels: a lowercase slug and an opaque provider key, no whitespace and no sentence punctuation. A partial unique index on the three-column tuple stops the same provider record landing twice, which `pending_ingest` guarded for the queue but nothing guarded for the vault. `lib/utils/freshness.ts` gives a source four states rather than two, so a connector that quietly stopped reads as out of date instead of connected. `components/settings/source-health.tsx` shows status, relative last sync, imported record count, the span the import actually covers, the provider's own error text, and a reconnect action, with a broken source marked visually distinct. Coverage comes from one `SECURITY DEFINER` function that reads three metadata columns and never touches ciphertext. The vault view dialog names the source and the capture time and says the source keeps its own copy, and the consent revoke dialog now states plainly that already-delivered copies are not recalled. | Nothing in scope. Backfill depth is reported from what was actually imported rather than requested, because the connectors do not yet take a range parameter. |

| LD-108 accessibility conformance | Delivered 2026-07-26 | `__tests__/e2e/accessibility/accessibility.spec.ts` runs axe-core against ten public and nine authenticated routes on every run, tagged `wcag2a` through `wcag22aa`, and fails on serious and critical violations with the rule and the offending selector in the message. It also drives sign in with the keyboard alone, proves the vault dialog is reachable and closes with Escape, and asserts that a validation error is linked to its control through `aria-describedby`. Every layout gained `components/layout/skip-link.tsx` and a named `main#main`, including the auth layout, which had no main landmark at all. The scan found and closed four real defects: the pricing badge and the home page call to action both failed AA contrast, and the sign-in and registration links failed "links must be distinguishable without relying on colour" because they were underlined only on hover. `/trust/accessibility` publishes the statement itself, and `lib/constants/__tests__/accessibility.test.ts` reads the layouts to check that the measures it claims are the measures that exist. | No manual screen reader testing and no third-party audit, both stated on the page rather than glossed over. Chart SVGs, custom-schema JSON display, and the memory-only vault key timeout are published as named limitations with a criterion each. |

| LD-205 browser extension foundation | Delivered 2026-07-26 | `extension/` is a Manifest V3 extension whose install-time permission set is exactly `downloads` and `storage`, plus host access to this application and nothing else. `webNavigation` and `<all_urls>` are declared optional, so the browser withholds them until the person accepts a prompt, and that is checkable on the browser's own extension details page rather than being a promise. `extension/tiers.json` is the single description of the model: the extension reads it at runtime, `/trust/extension` publishes it, and a test asserts it matches the manifest, so widening the manifest without saying so fails the build. Turning a tier off calls `chrome.permissions.remove`, and only once no other enabled tier still needs the permission, which a test drives against a fake `chrome` rather than asserting in prose. Enablement is read from the browser, never from extension storage, so a permission revoked in browser settings shows as off. The background worker notices a finished export, and the file is read only when the vault page asks for it, handed over `window.postMessage` on this origin, and encrypted in the browser before anything is stored. | Provider-specific walkthroughs are written but cannot be end-to-end verified until LD-203 supplies the matching parsers, which the spec already made conditional. The extension is not published to a browser store; it loads unpacked, and `/trust/extension` says so rather than implying a store listing exists. |

| LD-206 tracker transparency and browsing insight | Delivered 2026-07-26 | Tier 1 of the LD-205 model. On a completed navigation the worker asks the page what it already fetched, through the browser's own performance timeline, and classifies it against a list that ships with the extension. `extension/src/url-safety.js` is the only route from a URL to something storable, and it returns a registrable domain or nothing: no path, no query string, no fragment, no subdomain. The adversarial tests cover session tokens, email addresses, embedded credentials, and OAuth fragments. A sensitive site produces no record at all rather than a filtered one, because a filter is something a later change can forget to apply. Findings are counted, not listed, and a saved summary goes to the vault as a `browsing_insight` entry through the normal envelope, holding company names and counts and never which sites were visited. Tier 1 also installs a `declarativeNetRequest` rule that sends `Sec-GPC: 1`, because reporting who tracks someone while staying silent about their opt-out would be incoherent. A detected collector links straight into a prefilled LD-301 rights case. Three tests read the analysis source and assert it contains no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, or `EventSource`, which is what turns "analysis is local" from a claim into a check. | Reporting only, no blocking, as the spec required. The tracker list is bundled and finite; an unrecognized third party is still counted but without a company name, and the UI says so. Escalation drafts a request to us to forward, because a rights request has to come from an account that can be verified. |

### 6.5 Defects found while building Phase 2

`supabase/migrations/20260726160000_api_role_grants.sql`.

Resetting a local database from the migrations produced an application that could not read its own tables: every request failed with `permission denied for table vault_data` for the `authenticated` role. The cause is that tables here are created by `postgres`, and the default privileges for `postgres` in the public schema grant only TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN to the API roles. The Supabase default that grants SELECT, INSERT, UPDATE, and DELETE belongs to `supabase_admin`, so it never applied to anything these migrations created.

Existing deployments work because they were provisioned before this, which is precisely why it went unnoticed: the schema was not reproducible from the migrations alone. Anyone bootstrapping the project from a clean database got a broken application, and the failure looked like an auth problem rather than a privilege one.

The migration grants the privileges explicitly, sets matching default privileges so the next migration does not reintroduce the gap, and re-applies every closure the blanket grant would otherwise have undone. Row level security remains the guardrail; table privileges only decide whether PostgREST can reach RLS at all.

Two things follow. Any migration that adds a table meant to be service-role only must add its own `REVOKE ALL ... FROM anon, authenticated`, because the default privileges now grant DML to new tables. And `npx supabase db reset --local` is worth running before a release, since it is the only thing that would have caught this.

A second, smaller instance of the same class turned up while building LD-503. `REVOKE EXECUTE ... FROM PUBLIC` on a new function removes the default grant from **every** role, `service_role` included, so a function meant to be service-role only needs an explicit `GRANT EXECUTE ... TO service_role` immediately afterwards. Without it the failure appears at runtime as a permission error rather than at deploy time. Treat revoke-then-grant as a single idiom.

A third turned up in LD-201's own code while building LD-202. `disconnectSource` offers to delete the entries a provider imported, and it did that by filtering `vault_data.source_provider`, a column that did not exist until LD-202 added it. Nothing failed at build time because the Supabase client types a `.eq()` column as a string, and nothing failed in the tests because the option defaults to false. It would have failed the first time a person chose to delete their imported data, which is the worst moment for it to fail. The lesson is narrow but worth keeping: a query written against a column a later spec is going to add is a runtime error with no compile-time signal, so either add the column in the same change or leave the branch unwritten.

Four more came from LD-108's automated scan, all on pages that had been read by eye more than once. The "Most popular" badge on the pricing table used a five percent primary tint behind primary-coloured text and missed AA contrast. The home page call to action used muted grey on a tinted panel, which sits at 4.6:1 on white and drops below the threshold once the background is tinted. The sign-in and registration cross-links were underlined only on hover, so within a paragraph they were distinguishable by colour alone. None of these is subtle once a tool points at it, and none of them was noticed without one. That is the argument for the scan running on every change rather than as a periodic review.

### 6.6 What is left in Phase 2

Nothing. All twelve specs are delivered, one of them (LD-602) in part. The sequence and the reasoning are kept below because the notes on each still apply to whatever touches that area next.

**1. LD-503 buyer evaluation surface.** Delivered 2026-07-26. Kept here because the reasoning still applies to anything that quotes a price or a volume: call `prepareRelease`, do not estimate.

**2. LD-604 bulk and asynchronous organization operations.** Delivered 2026-07-26. Worth noting for anything that follows: the row-level idempotency key and the `after()` start are the two things that make a long operation safe to resume, and both should be copied rather than reinvented.

**3. LD-201 connector framework.** Delivered 2026-07-26. Two things it proved worth recording. The build gates worked exactly as intended: adding `packages/core/src/crypto/ingestion-keys.ts` failed the suite until the trust centre disclosed it, and `data_sources` and `pending_ingest` failed until the deletion manifest covered them. And the LD-501 classification caught a leak in my own first draft, where the queue row carried the provider's free-text activity name in the clear. It is classified as an identifier for good reason, so the label is now sealed with the payload and the queue row shows a neutral placeholder.

**4. LD-202 source health and provenance.** Delivered 2026-07-26. It closed a latent defect on the way: `disconnectSource` already filtered `vault_data.source_provider` when asked to delete imported entries, and that column did not exist, so the option would have failed at runtime on first use. Two rules worth carrying forward. Unencrypted metadata needs a shape narrow enough that content cannot fit through it, enforced in the database as well as in Zod, because the schema is the only thing standing between a convenience field and a leak. And reading the clock during render is now a lint error, so relative-time components take `now` as a prop from a caller that read it in an effect.

**5. LD-206 tracker transparency and browsing insight.** Delivered 2026-07-26. The earlier note wondered whether the insight could be delivered without the extension. It cannot: seeing who collects from a page requires being on the page, and every server-side approximation would mean sending us browsing data, which is the thing this feature exists to expose. Three things are worth carrying into LD-207. The sanitizer is the only route from a URL to something storable, and keeping it that way is what makes a single adversarial test meaningful. A sensitive site produces no record rather than a filtered one, because a filter is something a later change forgets to apply. And a test that reads the analysis source for `fetch` is worth more than any amount of prose about local processing, because it fails when someone adds one.

**6. LD-205 extension foundation.** Delivered 2026-07-26. The estimate note was right: an extension is a separate artifact with its own manifest, its own permission model, and a store review this repository cannot perform. What made it worth doing first is that the permission model is the product claim. "We will not watch you browse" is unverifiable prose; `optional_permissions` makes the browser the enforcement point, and a user can confirm it without trusting us. Two rules follow for LD-206 and LD-207. Read enablement from `chrome.permissions.contains`, never from extension storage, or a permission revoked in browser settings leaves the feature claiming to be on. And when two tiers share a permission, removing it for one silently breaks the other, so revocation has to check what else is still enabled.

**7. LD-108 accessibility conformance.** Delivered 2026-07-26. Two findings worth carrying. Automated scanning is genuinely worth the setup cost: it found four real contrast and link-distinguishability defects on pages that had been reviewed by eye more than once, which is exactly the class of problem people do not catch by looking. And the honest version of an accessibility statement is more useful than a passing one, so the page names what has not been tested rather than implying the automated pass covers the standard.

Two smaller pieces of unfinished work sit outside that list and should be picked up with whichever spec touches them next.

- **An operator console.** Three things now need one and none has a screen: `pause`, `resume`, `extend`, and `resolve` on a rights case, `createWebhook` for an organization, and `releaseHeldPayouts` from LD-506. Two of those are deliberate, because a person must not advance their own rights case or clear their own payout hold, but the consequence is that an operator has to act through the service role by hand. This is now the largest single gap left behind Phases 1 to 3, and it is one piece of work rather than three.
- **Webhook management for organizations.** `createWebhook` is a service function with no UI, so an endpoint can only be registered by an operator. Worth doing together with the console above.

### 6.7 Production infrastructure

The product moved from `lucid-data.vercel.app` to `luciddatabank.com` on 2026-07-27. This is recorded here
because two of the decisions constrain later work.

**One origin, not four.** `luciddatabank.com` serves the app. `www`, `luciddatabank.app`, `luciddatabank.co`,
and the old `lucid-data.vercel.app` all redirect to it while preserving the path. The alternative, attaching the
extra domains as serving aliases, would have broken four things at once. A passkey is bound to its relying-party
id, so a credential registered on one origin does not work on another. Sessions are per-origin, so a user signed
in on one domain appears signed out on the next. OAuth callbacks are derived from `NEXT_PUBLIC_APP_URL` and
would not match the origin the user started from. And the extension holds a host permission for a single origin,
so the bridge would go quiet on the others. Anything added later that is origin-bound should assume one canonical
origin and keep the rest as redirects.

**The credential context URI is now on a domain we own.** Issued credentials and vault exports carry a JSON-LD
context at `https://luciddatabank.com/`. It previously pointed at a domain owned by a third party, which meant
the vocabulary defining every credential we issue sat on an address someone else controlled. This was safe to
change only because production held no issued credentials at the time. Once credentials exist in the wild the
context URI is effectively permanent, because a verifier resolving an older credential still expects the old
address to answer. Treat it as frozen from here.

Email is complete. Zoho carries mailboxes, Resend carries application notifications, and both are
authenticated: SPF and DKIM per sender, and a DMARC policy at `p=none` collecting reports while the
picture settles. Resend's SPF sits on a `send.` subdomain rather than the apex, which is what keeps the
Zoho record intact. Two SPF records on one name is a permanent failure rather than a merge, so anything
added later must edit the existing record rather than publish a second.

### 6.8 Outstanding setup

None of these block Phase 3. They are recorded so they are not lost.

| Item | State | Why it matters |
| --- | --- | --- |
| Strava OAuth app | Not created | LD-201 and LD-208 cannot complete an authorization round trip without it. Fitbit was dropped on 2026-10-05 when Google retired its Web API; see section 6.14 |
| Extension store listings | Not started | Chrome, Edge, Firefox, and Safari each need their own submission, now tracked as LD-212. Firefox needs `browser_specific_settings` and a script background, Safari needs a container app, and Chrome needs a paid developer account |
| DMARC enforcement | At `p=none` | Monitoring only. Tightening to `quarantine` should wait for a few weeks of reports, so a legitimate sender is not silently dropped |

Closed since this table was written: the DMARC record, the Resend sending domain and API key, and the
extension icons, which were a hard blocker on any store submission.

### Phase 3, months 6 to 9. Make credentials portable and access governed

Status: started 2026-07-27. LD-506 and LD-610 are delivered, LD-401 is delivered in part, and LD-204 has had its
blocking dependency removed. The per-spec record is in
[section 6.9](#69-phase-3-delivery-record).

Re-sequenced on 2026-10-05 for the health and fitness focus; see
[section 6.14](#614-re-sequencing-for-the-health-and-fitness-focus). These come first, in this order:

- LD-610 production hardening and observability (delivered 2026-10-08)
- LD-110 legal terms and US consumer health privacy (delivered 2026-10-08, apart from counsel's review)
- LD-111 health-first positioning and accurate claims (delivered 2026-10-08)
- LD-609 shared core package (delivered 2026-10-08)
- LD-608 versioned client API (delivered 2026-10-08)
- LD-209 health schema expansion (delivered 2026-10-08)
- LD-204 mobile application, stages A and B together (portable crypto core delivered)
- LD-208 connector framework v2
- LD-210 archive import and health export adapters
- LD-212 cross-browser extension builds and store release
- LD-214 health timeline and insights
- LD-112 passkey vault unlock and reload-safe sessions

The earlier queue follows, unchanged apart from LD-204 moving up:

- LD-401 standards-based credential formats (delivered in part)
- LD-402 derived proofs (unblocked by LD-401)
- LD-405 credential correction, supersession, and renewal (unblocked by LD-401)
- LD-304 portable import and transfer
- LD-506 marketplace integrity and fraud controls (delivered)
- LD-606 abuse reporting and enforcement
- LD-605 platform integrity and insider controls
- LD-502 governed access, started

Exit criteria: a LucidData credential verifies in an external wallet, buyers can purchase a verified claim rather than a copy, and a credential can be held on a phone. Added 2026-10-05: a person can install the app on iOS or Android, bring in their Apple Health or Health Connect history, and see it in the timeline on the phone and on the web.

### 6.9 Phase 3 delivery record

| Spec | Status | What landed | What did not |
| --- | --- | --- | --- |
| LD-110 legal terms and US consumer health privacy | Delivered 2026-10-08, apart from counsel's review | Terms, privacy policy, consumer health data privacy policy, organization terms with the processing agreement, and an account deletion page, all public and linked from the footer. Versioned acceptance at registration, a blocking prompt after any change, separate and withdrawable consent before health data is stored, enforced in the service, and the FTC breach steps in the runbook. Writing the documents found three published inaccuracies, recorded in the spec and fixed. | Counsel has not reviewed the text, which should happen before a store submission and costs more than the monthly budget allows, so it waits on the owner. Telling organizations about a person's deletion request is manual until LD-611. |
| LD-111 health-first positioning and accurate claims | Delivered 2026-10-08 | Every public page, the pricing table, the manifest, and the first-run wizard lead with the health vault under the LucidData name, with no earnings pitch and no ranked tier. Numbers and restrictions come from the constants the product enforces, and a test scans the public copy. Checking the claims found that health data could reach a sale through a pool of another category; the service now judges the stored entry, and the vault and contribute dialog stop offering restricted data. | The dashboard still leads with the marketplace until LD-214, and the Apple Health import limits wait for LD-210. |
| LD-609 shared core package | Delivered 2026-10-08 | `@luciddata/core`, an npm workspace in `packages/core` holding the browser crypto, schemas, validation, field classification, import adapters, and normalizers, compiled by the web app from source. ESLint and a boundary test keep framework, server, Node, and web-app imports out of it, and the trust centre names each crypto module by its real path. | The server's release gate stays in the web app because it is server work. Nothing consumes the package except the web app until LD-204. |
| LD-608 versioned client API | Delivered 2026-10-08 | `/api/v1`, 49 operations covering what the web app does for its owner. Calls carry the person's Supabase access token, so row level security judges every read and write. Handlers call the same services as the server actions and never the service role, and the OpenAPI document is generated from the schemas they parse with. Moving logic into services found a recovery confirmation defect, now fixed. | Listing and ending sessions are not in the API yet. Organizations keep their own API at `/api/org`. |
| LD-209 health schema expansion | Delivered 2026-10-08 | Sleep sessions, daily vitals, body measurements, and daily nutrition, filed under health, so the database refuses to sell them and asks for health consent before storing them. Each has form fields, a classification for every field, and bounds that catch a unit mix-up. Typed records are now checked in the browser before they are encrypted, which nothing did before: the validators existed and were never called. | Reproductive and menstrual data, left out on purpose under open decision 12. Import adapters that produce the new types wait for LD-210, and capture on the phone for LD-204. |
| LD-610 production hardening and observability | Delivered 2026-10-08 | All seven criteria, recorded in the spec. Paid tiers with the spend capped below the owner's limit, custom SMTP and Turnstile on every password call, a staging project behind previews, migrations applied only by a workflow with an approval for production, schema lint and pgTAP in CI, a nightly Playwright run, a scrubbing error logger, cookieless page counts, a published restore drill, and the section 6 measures computed from first-party data. On the way it closed five defects that were live in production: email ownership was never verified, step-up confirmation sent the password to the server, the service worker cached cross-origin responses, sign-in trusted an off-site redirect, and the reset-link allowlist matched strangers' Vercel projects. The last one came back once, through the Supabase Vercel integration, which is now disconnected. | Point-in-time recovery, a paid add-on, so a restore returns the last daily backup. Extension installs come from the store dashboards, and timeline visits wait for LD-214. The first sign-in after confirming an address was exercised against local Supabase rather than production, because Turnstile rightly refuses automated browsers there. |
| LD-506 marketplace integrity and fraud controls | Delivered 2026-07-27 | Three controls that fail differently on purpose. A partial unique index makes one vault entry contributable to a pool once while it is active, so a duplicate is refused by the database rather than by a caller who might forget to check; withdrawing and re-contributing stays possible, because that is a decision a person is entitled to reverse. Velocity is counted from `pool_contributions` itself rather than through the LD-109 rate limiter, because that limiter fails open, which is right for a throttle and wrong for anything standing in front of money. A balance above the review threshold is set to `held` with a plain reason rather than sent, and the contributor sees it as held and still owed rather than missing. `pool_assurance_mix` splits a pool three ways, so a buyer can see how much of it an organization vouched for before paying. | No operator review queue. Releasing a hold is a service function with no screen, for the same reason the rights console is missing: a person must not be able to clear their own hold. Buyer-side collusion signals are not implemented; the spec lists them, and they need a definition of "related to itself" that survives contact with real corporate structures. |
| LD-204 mobile application, stage A | Started 2026-07-27 | The portable crypto core, which blocks everything else in stage A. `packages/core/src/crypto/runtime.ts` resolves Web Crypto, random bytes, UTF-8, and base64 in one place, so the vault crypto no longer reaches for browser globals that React Native's Hermes engine does not have. Base64 is implemented directly rather than through `btoa`, which Hermes lacks and whose usual workaround overflows the call stack on export-sized input. Known-answer vectors were generated from an independent Node WebCrypto path and pinned **before** the refactor, so the change had to prove it preserved behaviour rather than assert it. One vector is a complete envelope encrypted outside this codebase: any runtime that opens it can open a web-created vault, which is the executable form of the cross-surface guarantee. | The application itself. An app shell, platform-backed key storage, and biometric unlock need a device or simulator and store accounts, none of which this repository can exercise. What is delivered is the part that had to be true first, and the part that can be verified here. |
| LD-401 standards-based credential formats | Delivered in part 2026-07-27 | `lib/credentials/formats/` is a registry of three formats behind one `issue`/`verify`/`describe` interface, and an unknown or ambiguous format throws rather than falling back, because a verifier that guesses can be steered into checking a credential under weaker rules than the issuer applied. The native Ed25519 format is registered as a peer rather than the baseline, so it cannot quietly gain behaviour the others lack, and a test verifies a payload built the way `credential.service.ts` has always built one, which is what proves existing credentials still work. **SD-JWT VC is the piece that matters**: each claim is committed to by a salted digest, so a holder can drop disclosures without the issuer key and the signature still covers the whole set. That is what LD-402 needs for "over 18 without a birth date" and what LD-404 needs so a doorstep check does not require a home address. Every format is issued once and its bytes stored, so a verifier checks what was signed rather than a re-serialization. `/trust` publishes the table. | Key binding, and with it a genuine replay defence. OpenID4VCI and OpenID4VP endpoints, which are protocol surfaces that cannot be meaningfully verified without an external wallet; shipping unverifiable endpoints would be worse than not shipping them. A normative Linked Data proof for VC 2.0. All three are recorded against the acceptance criteria rather than glossed. |

Three findings are worth carrying into whatever touches these areas next.

- **Pin the vectors before the refactor, not after.** Generating known-answer values from the code you are about to change proves nothing. Generating them independently first turns a risky edit to the most security-sensitive module in the project into a change that either passes or fails visibly. The same approach applies to LD-401, which adds credential formats alongside an existing one and must not disturb it.
- **A control in front of money must not fail open.** The LD-109 rate limiter fails open by design and says so, which is correct for throttling a public endpoint. Reusing it for contribution velocity would have meant a store outage silently removing a fraud control. Counting the authoritative rows instead cannot fail open, because if the table is unreachable the write fails too.
- **LD-401 unblocks three specs and half-unblocks a fourth.** LD-402 derived proofs and LD-405 supersession both listed it as their only dependency, and both can now start. LD-404 still needs LD-204 stage A, which needs a device. Anything building on the registry should note that the native format is a peer entry, so adding a fourth format is a registry change rather than a rewrite of issuance.

One defect was introduced and caught inside LD-506 itself, and it is the kind worth recording because
both halves were individually correct. LD-505 requires that a closing account is paid whatever it is
owed. LD-506 added a `held` status that an ordinary payout run deliberately ignores. But
`findPendingPayouts` filtered on `status = 'pending'`, so the closure flush could not see a held
balance at all: the money would have been owed, held, and unreachable, which is worse than either
spec failing on its own. Closure now includes held payouts explicitly, and a test asserts it, because
nothing in the payout path had test coverage before and that is precisely why the gap survived being
written. The general lesson is narrow: when a new status is added to a table, every query that filters
on status is a candidate defect, and the compiler will not point at any of them.

### Phase 4, months 9 to 12. Broaden and deepen

Status: started 2026-07-27. LD-203 is delivered. The record is in
[section 6.10](#610-phase-4-delivery-record).

Re-sequenced on 2026-10-05. These come first, in this order:

- LD-305 health summary sharing
- LD-612 consumer subscription
- LD-611 operator console and webhook management
- LD-211 US health records
- LD-213 platform data through portability channels

The earlier queue follows:

- LD-404 proximity credential presentation, deprioritized on 2026-10-05
- LD-204 stage B health capture, moved to phase 3 on 2026-10-05
- LD-104 account continuity for death and incapacity
- LD-502 governed access, completed
- LD-203 provider export adapters, with the LD-205 walkthroughs (delivered)
- LD-207 opt-in browsing contribution
- LD-103 client-side search
- LD-403 delegation, subject to a threat model
- LD-504 offer targeting

Phase 4 is over-subscribed and will not fit in three months. It is listed in priority order rather than
as a commitment. If capacity is limited, LD-404 and LD-204 stage B are the two that matter, because
together they complete the in-person credential use case. LD-207 should slip rather than ship rushed,
since it is the highest-risk path in the product.

Superseded on 2026-10-05: LD-204 stage B moved to phase 3, and LD-305 and LD-612 are now the two that
matter most here. LD-404 waits until an issuer vertical needs in-person checks.

### 6.10 Phase 4 delivery record

Sequencing note, because the phase headings imply an order the dependencies do not allow. LD-404 is the
headline of this phase and cannot start: it depends on LD-401, LD-402, and LD-204 stage A, all of which
sit in Phase 3 and none of which is built. Four more Phase 4 specs are blocked on decisions rather than
code, and are listed below. What was available was LD-203, which depends only on LD-201.

| Spec | Status | What landed | What did not |
| --- | --- | --- | --- |
| LD-203 provider export adapters | Delivered 2026-07-27 | `packages/core/src/vault/adapters/` holds one module per provider behind a shared `detect` and `parse`, and a registry that returns null when nothing matches, so an unrecognised file imports exactly as well as it did before. Apple Health is parsed by scanning rather than through `DOMParser`, which is a size decision: a year of Health data is routinely hundreds of megabytes and tens of millions of elements, and building a DOM of that ends the tab before any of it reaches the vault. Scanning also lets the record limit apply while reading, so a large file truncates instead of failing. Quantity samples are aggregated per calendar day, because one entry per sample would be tens of thousands of useless records. The bank adapter reconciles the column names, date orders, and debit-or-credit conventions that differ between every bank, and refuses to rewrite a genuinely ambiguous date rather than silently moving a transaction by a month. | No zip handling: the person unzips and picks the file, which the walkthroughs now say. The bank adapter claims no schema type, because `financial_summary` describes an account rather than a transaction and there is no transaction schema. Adding one is a deliberate decision rather than a side effect of an import adapter, since it would need a quasi-identifier classification before anything typed with it could be sold, and transaction data is about as re-identifying as data gets. |
| LD-205 walkthroughs, last open criterion | Closed 2026-07-27 | The walkthroughs existed from Phase 2 with nothing behind them, which is what the criterion was really tracking. Each source now names the adapter that reads its output, and a test asserts the link. A walkthrough talks someone through a request that takes hours, and Google's takes days, so completing that and then failing to read the file is worse than never having offered. | Nothing in scope. |

Blocked in Phase 4, and blocked on a decision rather than on work:

- **LD-207 opt-in browsing contribution** waits on open decision 8, which asks whether LucidData wants to be in the browsing data market at all. LD-206 built the collection capability either way, so the decision is now live rather than hypothetical. It is also the highest-risk path in the product and the roadmap already says it should slip rather than ship rushed.
- **LD-403 delegation** waits on open decision 3. The key-sharing model has to be chosen and threat-modelled first, because the obvious implementation quietly widens the trust model.
- **LD-502 governed access** waits on open decisions 1, 4, and 10: the DGA intermediation role, whether export stays first-class, and how a recurring fee works when the LD-505 model is per-record and pinned at consent.
- **LD-104 account continuity** has its LD-303 dependency satisfied, but its own spec says the policy question of whether an attested death claim is accepted at all is a legal decision to resolve before implementation. Inactivity-only is buildable now if that is the answer.

### 6.11 The CI failure, and why it went unnoticed

Every CI run since the connector work failed, thirty-four of them, while every developer machine stayed
green and Vercel kept deploying. Worth recording because the shape of it is more instructive than the
fix.

**Vercel only runs the build.** Typecheck, lint, and the test suite are CI's job, so a red suite and a
healthy production deployment are entirely compatible states. Deployment success is not evidence that
the tests pass, and it was read that way for several days.

**The defect was real, not a flaky test.** Web Crypto accepts a bare `ArrayBuffer` in the specification,
but Node 20 validates that argument with a realm-sensitive check. Under jsdom the buffer is created in
one realm and the crypto implementation lives in another, so a valid `ArrayBuffer` is rejected with
"not instance of ArrayBuffer". Node 22 replaced the check with a V8-backed one, which is why it passed
on a Node 25 workstation. Every failing call passed a bare buffer; every passing call already passed a
typed-array view, which is validated through a check that is not realm-sensitive.

Three things follow.

- **Pass views, not buffers.** `packages/core/src/crypto/runtime.ts` gained `asBytes()` and every crypto call in the directory goes through it. This matters past CI: React Native splits the page realm from a native implementation in exactly the same way, which is the portability LD-204 depends on.
- **Pin CI to the oldest supported runtime.** Running CI above the floor is what hid this. The workflow pins the floor with a comment saying why, and `package.json` declares the same floor in `engines.node`. **Updated 2026-10-05:** Node 20 reached end of life in April 2026, so the floor moved to Node 22 in both places, and AGENTS.md and the README say the same.
- **Reproduce the environment difference in a test rather than relying on CI to find it.** `packages/core/src/crypto/__tests__/realm-safety.test.ts` wraps `SubtleCrypto` in a proxy that refuses bare buffers the way Node 20 does, and runs the vault and sealed-box round trips through it. Two of its tests assert the wrapper rejects what it claims to, because a guard that cannot fail is not a guard.

### 6.12 There is no Phase 5
Recorded because it has now been asked for, and the answer is a decision rather than an oversight.

This roadmap covers twelve months in four phases. Section 1.2 lists what is deliberately out of scope
for that window, and says adopting any of it "requires a new spec ID in this document rather than a note
elsewhere." Inventing a Phase 5 to have somewhere to put new work would break the one rule that makes
this document usable: that it is the single place planned work lives, and that a spec exists before an
agent starts building against it.

There is also no shortage of work inside the existing phases. As of 2026-07-27, Phase 3 has six specs
unbuilt and Phase 4 has seven. Several are blocked on decisions rather than on capacity, and those are
listed in section 6.10. Anything genuinely new belongs in section 8 as an open decision first, then as a
numbered spec, and only then in a phase.

### 6.13 Every error message was being thrown away in production

Found 2026-07-27 while looking for what production was doing that development was not. It had been true
since the first server action shipped, and it affected the whole product rather than one feature.

React sanitizes anything thrown out of a Server Action in production. The client receives "An error
occurred in the Server Components render. The specific message is omitted in production builds to avoid
leaking sensitive details" and nothing else. For a stack trace or a database error that is exactly
right. For a message written for the person who caused it, it means the response is replaced by
framework boilerplate.

Every one of these was being discarded before anyone read it:

- "You have already contributed that entry to this pool"
- "This pool pays less than your minimum price per record"
- "You already have an open request of this type"
- "An organization must keep at least one owner"
- "Reconnect this source to continue syncing"

Three things made it survive. It works in development, because the sanitization is production-only, so
every manual test of an error path looked correct. The end-to-end suite runs a development server for
the same reason. And the components were not wrong: they catch and display `error.message` exactly as
they should, and the message was being lost in transit rather than in the handler.

The fix is the shape Next.js documents. An expected failure is returned rather than thrown, because a
returned value is data and data crosses the boundary intact. `lib/actions/action-result.ts` adds
`UserFacingError` for a service to raise, `guarded()` for an action to wrap its body in, and
`unwrap()` for the call site. Because `unwrap` turns the returned failure back into a throw carrying
the real message, every existing `try`/`catch` keeps working and only the call itself changes.

Two properties are worth keeping.

- **Safe by default.** Only `UserFacingError` is transported. A database error, a missing environment variable, or a bug still reaches the client as the generic message, because nobody wrote those for a reader. `lib/actions/__tests__/action-result.test.ts` asserts that directly, including that an arbitrary `Error` subclass is not treated as user-facing by accident.
- **The compiler enforces it.** `guarded()` returns `T | ActionFailure`, so a call site cannot use the result without handling the failure. Converting an action produces type errors at every one of its callers, which is how the org team conversion found all five of its own in one pass.

The conversion is now complete. Every service message that was written for a reader raises
`UserFacingError`, every action that can reach one returns through `guarded()`, and every call site
unwraps. That is 20 of 29 action files, 85 actions, and 66 call sites across components, hooks, and two
Server Component pages. The classes that already existed became user-facing too, so a rate limit, a
privacy gate refusal, a minimum order, an exhausted privacy budget, an unsupported credential format,
and a rejected webhook URL all explain themselves now.

The split was a judgement rather than a rule. `This organization has no billing account yet. Upgrade to
a paid plan first.` is an instruction to a person and is transported. `Stripe did not return a checkout
URL.` describes a broken integration and stays sanitized, along with the connector secret errors, the
email delivery failures, the API key invariants, and the webhook delivery responses. Roughly a third of
the candidates were operational and were deliberately left alone.

`lib/actions/__tests__/error-transport.test.ts` keeps it from regressing. It walks the `lib/` import
graph, works out which actions can reach a `UserFacingError` through any depth of imports, and fails the
build if one of them is not wrapped. It also fails if an action file wraps some of its exported
functions but not others, which is the mistake actually made here: the first four files converted by
hand had their mutations wrapped and their reads left behind, and the gate caught all four the first
time it ran. The call-site half needs no test, because the widened return type means a caller that
ignores the failure does not compile.

Two smaller things came out of it. `unwrap` cannot carry a `'use client'` directive, because Server
Components call actions too and the directive makes it unusable from the server half of the app.
And a type derived from an action's return needs `ActionData<T>` now, otherwise the failure case leaks
into the derived type.

### 6.14 Re-sequencing for the health and fitness focus

Decided on 2026-10-05, with the reasons recorded in section 8.1. Open decision 5 asked for a vertical.
The answer is personal health and fitness data, US first, with every surface in scope: the web app for
individuals and organizations, iOS and Android apps, and extensions for Chrome, Edge, Firefox, and
Safari. The mobile app is built with Expo and React Native.

What changed, and why the order is what it is:

1. **The web app could not go to a store or a phone as it stood.** Every store needs a privacy policy, a health app needs US health privacy terms, and the apps need an HTTP API and shared code. LD-110, LD-608, LD-609, and LD-610 come first because the rest depends on them.
2. **Most health data is reachable only from a phone.** Apple Health has no web API, and Samsung Health and most Android wearables reach third parties through Health Connect. That puts the LD-204 app, with capture in its first release, at the centre of the plan rather than at a later stage.
3. **The marketplace is not the pitch.** Health data stays unsellable here, by design and under Apple's and the providers' terms. LD-111 removes the earnings claims, and LD-612 adds the consumer plan the financial model already assumed.
4. **Fitbit is gone.** Google turns the Fitbit Web API off on 30 October 2026, and its successor, the Google Health API, has a waitlist. Fitbit data now arrives through Health Connect on Android and through Takeout, which LD-210 covers.

Capacity is one person working with AI agents, so the queue is strictly ordered and one spec is in flight
at a time, on its own branch.

Three fixes were made on 2026-10-05, ahead of the specs, because they could not wait:

| Change | Why |
| --- | --- |
| Fitbit connector retired | It is no longer offered, a grant can neither start nor finish, and an existing source stops syncing with the reason shown. No Fitbit OAuth app had been registered, so no user was affected |
| Unused `/api/supabase` proxy removed | It was public and unused, reflected any origin with credentials allowed, and logged full request URLs |
| Node floor raised to 22 | Node 20 reached end of life in April 2026. CI, `engines`, AGENTS.md, and the README now agree |

Deprioritized, not cancelled: LD-404 proximity presentation, LD-502 governed access, LD-207 browsing
contribution, and LD-403 delegation. None of them serves the health focus, and LD-404 also needs an
issuer vertical. Each keeps its place behind the new work.

Setup that only an account owner can do, and that the specs above wait on:

| Item | Needed by |
| --- | --- |
| Apple Developer Program as an organization, which needs a D-U-N-S number | LD-204, and the Safari build in LD-212 |
| Google Play Console as an organization | LD-204 |
| Chrome Web Store, Microsoft Partner Center, and Firefox add-on developer accounts | LD-212 |
| Vercel Pro and Supabase Pro (both done 2026-10-05) | LD-610 |
| Custom SMTP for Supabase Auth, and Turnstile keys (both done 2026-10-05) | LD-610 |
| A Strava API app, and Strava's approval for production use | LD-208 |
| Oura, Whoop, Withings, and Polar developer apps, and the Garmin Connect Developer Program | LD-208 |
| A place on the Google Health API waitlist | LD-208 |
| Counsel's review of the LD-110 documents | LD-110, and every store submission |

### Capacity reality

A dependency and capacity pass over all 40 specs found no circular dependencies, but it found that every
phase exceeds what two to three engineers can deliver in three months, phase 1 by roughly double before
the rebalance above. The phases are therefore priority-ordered queues, not commitments. Treat the exit
criteria as the definition of a phase, and let the dates move.

The longest dependency chain is only three steps, so the constraint is width rather than depth. That
means adding engineers helps, and that the highest-fan-out specs, LD-303, LD-601, LD-201, and LD-501,
should start as early as their dependencies allow.

The sixteen specs added on 2026-10-05 were checked the same way. They add no cycle, and the longest new
chain is still three steps, for example LD-209 to LD-214 to LD-305.

### Measures of success

Registrations alone will hide the adoption problem visible across this category. Track instead:

- Time from registration to first useful vault record.
- Share of users with at least one connected source after seven days.
- Consent completion rate and revocation rate.
- Repeat sharing within thirty days.
- Contributor earnings actually paid out, not accrued.
- Organization reuse: second credential issued, second pool purchased.
- Buyer conversion from pool view to purchase.
- Extension installs, tier 1 enablement, and whether extension arrivals retain better than direct signups.
- Credential presentations performed, and signups attributable to having been on the verifying side of one.
- Added 2026-10-05: health sources connected per person, days of history imported, and timeline visits per week.

Since 2026-10-07 these are computed by the `product_metrics` database function and stored weekly in
`metric_snapshots`; LD-610 records how each one is counted and the three that come from elsewhere.

## 7. Financial model

Modelled and arithmetically validated on 2026-07-25. Stripe and infrastructure figures are external
assumptions using US standard list pricing and are labelled where used. Everything about LucidData's own
behaviour is read from the code.

### 7.1 What is broken

LucidData retains a fixed access fee while Stripe charges a percentage of the entire transaction. Margin
is therefore constant while cost grows linearly, so every category has a pool size beyond which the sale
loses money.

Net to LucidData per sale under the current model:

| Category | 5 records | 500 | 2,000 | 10,000 | Loses money above |
|---|---|---|---|---|---|
| financial | $48.03 | $26.50 | -$38.75 | -$386.75 | 1,109 records |
| credentials | $48.08 | $30.85 | -$21.35 | -$299.75 | 1,386 records |
| personal | $23.89 | $15.27 | -$10.83 | -$150.02 | 1,377 records |
| location | $23.90 | $16.00 | -$7.92 | -$135.52 | 1,503 records |
| browsing | $9.34 | $2.16 | -$19.59 | -$135.59 | 648 records |
| health | $48.19 | $42.45 | $25.05 | -$67.75 | 4,159 records |
| interests | -$0.31 | -$1.75 | -$6.10 | -$29.30 | never profitable |
| other | -$0.31 | -$1.02 | -$3.20 | -$14.80 | never profitable |

Two consequences follow. Success makes it worse, because LD-201, LD-203, and LD-204 all exist to grow
pools. And LD-501 makes it worse too, because k-anonymity forces larger cohorts.

A second problem is independent of the first. Paying a contributor costs roughly $2.25 a month once the
Connect active-account fee and a payout are counted, both assumptions. Against a typical per-sale
payout, that is not viable:

| Payout | Cost as share of payout |
|---|---|
| $0.60 | 375% |
| $1.50 | 150% |
| $5.00 | 45% |
| $25.00 | 9% |

Paying people the moment they earn 60 cents destroys more value than it delivers.

### 7.2 Proposed model

Four changes, each addressing a specific failure above.

**A percentage platform fee replaces the fixed access fee as the margin source.** LucidData retains 25%
of gross. Cost and revenue then scale together, so pool size stops being a risk. The access fee stays as
a floor, not as the margin.

**A minimum order value of $50.** Validated minimum for profitability is $1.36 at a 25% take, so $50 is
conservative and also matches how buyers actually purchase, since a five-record cohort is not a useful
dataset and LD-501 will refuse it anyway.

**An earnings ledger with a $25 payout threshold.** Contributors accrue continuously and are paid when
the balance clears $25, which brings payout cost to 9% of the amount moved. Balances must be visible,
owed on demand at account closure, and never expire.

**Repricing.** `interests` and `other` cannot support a viable transaction and should be withdrawn from
sale or repriced. `health` at 40 cents a record sits below `browsing` at 50, which does not reflect its
sensitivity or its market value.

Net to LucidData under the proposed model, same pool sizes:

| Category | 5 | 500 | 2,000 | 10,000 |
|---|---|---|---|---|
| financial | $12.41 | $176.50 | $673.75 | $3,325.75 |
| credentials | $12.08 | $143.35 | $541.15 | $2,662.75 |
| health | $11.19 | $54.95 | $187.55 | $894.75 |
| browsing | $10.75 | $57.16 | $222.91 | $1,106.91 |

Positive at every category and every pool size tested from 1 to 100,000 records. The relationship is now
the right way round: bigger pools earn more, which aligns the commercial incentive with LD-201 and with
the privacy requirement in LD-501.

### 7.3 The uncomfortable result

The take rate comes out of the contributor's share, so people earn less per sale than the current code
promises. At a 25% take and a 500-contributor pool:

| Category | Per sale | 4 sales/yr | 12 sales/yr | 24 sales/yr |
|---|---|---|---|---|
| financial | $1.20 | $4.80 | $14.40 | $28.80 |
| credentials | $0.97 | $3.90 | $11.70 | $23.40 |
| health | $0.38 | $1.50 | $4.50 | $9.00 |
| browsing | $0.39 | $1.56 | $4.68 | $9.36 |

A realistic contributor earns somewhere between a few dollars and thirty dollars a year. Many will not
reach the $25 payout threshold within a year.

The reason is not cohort dilution. Each record is priced separately, so a contributor receives roughly
75% of the per-record price no matter how large the pool is. Earnings are low simply because the
per-record price is low. Section 7.6 tests whether raising it fixes the problem.

The reference figure of $150 per person per year for financial data is the value across the entire
economy and every use, not what one buyer pays for one snapshot.

This has a direct product consequence. **The marketplace cannot honestly be sold as income.** Copy
promising that people will earn from their data will be contradicted by the first payout screen, and
LD-101 exists precisely to stop the product making claims it cannot support. The marketplace should be
positioned as a dividend on data the person is storing anyway, with the amount shown before consent, per
LD-505.

### 7.4 Where the business actually is

Modelled monthly, assuming a fully loaded three-engineer team at $45,000 and infrastructure at $200 plus
five cents per active user, all assumptions:

| Scenario | Orgs | Consumer premium | Marketplace GMV | Revenue | Net |
|---|---|---|---|---|---|
| Year 1 pilot | 10 starter, 2 growth | 500 | $2,000 | $3,530 | -$41,945 |
| Year 2 growth | 60 starter, 15 growth | 5,000 | $25,000 | $32,950 | -$14,500 |
| Sustainable | 120 starter, 60 growth | 12,000 | $80,000 | $89,500 | +$38,700 |
| Year 3 scale | 200 starter, 120 growth | 30,000 | $200,000 | $209,880 | +$150,680 |

At the sustainable point the revenue mix is roughly 27% organization subscriptions, 54% consumer
subscriptions, and 20% marketplace take. The marketplace is the smallest line even when it is working.

The conclusion the numbers support: **the marketplace is a supply and retention mechanism, not the
revenue engine.** It gives people a reason to fill a vault and a reason to keep it current. The revenue
comes from organizations paying for verification, issuance, and governed access, and from consumers
paying a small subscription for the things they actually value, which the persona work suggests are
continuity under LD-104, tracker insight under LD-206, and credential presentation under LD-404.

A consumer tier around $4 a month sits sensibly against Optery at $3.25, Cozy at about €4, and Incogni
at $7.99, all of which sell narrower value than a vault plus credentials plus rights handling.

Two further observations from the model. A 25% take is not aggressive for this category; 15% still
yields $1,210 on $10,000 of monthly volume and would be defensible if a lower take were preferred for
positioning. And the $49 and $299 organization plans look under-priced against comparables such as
Terra's $499 entry point, particularly once LD-602, LD-604, and LD-404 add real integration value. The
per-org marginal cost is small, so these plans are not loss-making, contrary to an earlier estimate that
mistakenly attributed whole-platform infrastructure to a single customer.

### 7.5 Decisions this forces

1. The take rate. 25% is the modelled recommendation. Anything below about 5% cannot cover processing on small orders.
2. Whether to reprice or withdraw `interests` and `other`.
3. Whether consumer subscription is part of the model. The break-even mix depends heavily on it, and it is the largest single line at the sustainable point.
4. How marketplace earnings are described to users, given the numbers above. This is a claims-accuracy question and belongs with LD-101.
5. Whether to raise organization subscription prices and introduce per-verification pricing. See 7.6.

### 7.6 Can the problem be fixed by charging businesses more?

Partly, and the answer differs by revenue type. Modelled separately because the intuition is right about
the mechanism but runs into a market ceiling.

**The mechanism does work.** Raising the per-record price flows through to contributors almost one for
one, since they receive about 75% of it. There is no dilution to overcome.

**The ceiling is what a buyer will pay for bulk data.** Reaching $100 a year per contributor at four
sales a year requires about $33 per record, which prices a 500-record dataset at roughly $16,550.

| Price multiple | Per record | Buyer pays for 500 records | Contributor per year | LucidData per sale |
|---|---|---|---|---|
| 1x, current | $1.50 | $800 | $4.50 | $176.50 |
| 2x | $3.00 | $1,550 | $9.00 | $342.25 |
| 5x | $7.50 | $3,800 | $22.50 | $839.50 |
| 10x | $15.00 | $7,550 | $45.00 | $1,668.25 |
| 22x | $33.00 | $16,550 | $99.00 | $3,657.25 |

The problem is what that competes against. Bulk anonymized data is a commodity sold by brokers at cents
per record, and consented profile data trades closer to fifty cents. At $33 a record LucidData would be
charging survey-panel prices for data the buyer did not commission and cannot follow up on. There is
room to raise bulk prices, plausibly to a few dollars a record for high-value verified categories, but
not by the order of magnitude that would turn data sales into income for the individual.

**Two revenue types escape the ceiling entirely, and both are already in the roadmap.**

Verification fees are not pooled. The subject earns from every check performed about them, and the buyer
is comparing the price to a manual verification rather than to a data feed.

| Fee per check | 4 checks/yr | 12 | 24 | 52 |
|---|---|---|---|---|
| $2 | $6 | $18 | $36 | $78 |
| $5 | $15 | $45 | $90 | $195 |
| $10 | $30 | $90 | $180 | $390 |
| $15 | $45 | $135 | $270 | $585 |

A tradesperson whose insurance is checked weekly earns about $390 a year at a $10 fee, against roughly
$5 a year from pool sales. This is the LD-404 use case, and it turns out to be worth an order of
magnitude more to the individual than the marketplace is.

Recurring governed access under LD-502 has the other useful property: the same cohort can be licensed to
several buyers at once, which a snapshot sale cannot, because the buyer keeps the copy. Five buyers at
$500 a month against a 500-person cohort yields about $45 a year per contributor and $7,500 a year to
LucidData from a single cohort.

**Organization subscriptions should go up.** Moving from $49 and $299 to $99 and $499 adds roughly
$18,000 a month at the sustainable scenario, and the comparables support it, with Terra starting at $499
for a narrower product. Note that verification vendors do not publish per-check pricing at all; Truework,
now part of Checkr Group, quotes rather than lists. That is itself evidence this is a negotiated market
with real willingness to pay, and a reason to treat the fee figures above as assumptions to confirm.

**What an engaged individual could actually earn per year:**

| Source | Annual |
|---|---|
| Pool sales across three categories, four sales a year | $7.50 |
| Verification fees, twelve checks a year at $10 | $90.00 |
| Governed access share, three concurrent buyers | $27.00 |
| Total | $124.50 |

So the answer is yes, charge businesses more, but not mainly for bulk data. The revenue that pays
individuals properly comes from verification and recurring access, where LucidData is selling something
scarce rather than competing with data brokers on price. That also points the product at its strongest
position: verified claims about a specific person, delivered instantly with consent, rather than
anonymized behavioural data where scale wins and LucidData has none.

## 8. Open decisions

These need a human decision before the dependent specs can be executed.

1. Data intermediation role. If LucidData presents itself as a neutral intermediary in the EU, the DGA requires separating the regulated activity and prohibiting unrelated use of the data. This constrains the marketplace design and should be settled before LD-502.
2. Connector token custody. LD-201 requires a server-held key to call provider APIs. This is a real, disclosed narrowing of the zero-knowledge claim. Confirm the tradeoff is acceptable and that LD-101 will disclose it.
3. Delegation key model. LD-403 cannot proceed until the key-sharing approach is chosen and threat-modelled.
4. Export versus governed access. Decide whether raw export remains a first-class product or becomes a fallback. This determines how much of LD-502 is worth building.
5. Vertical wedge. **Decided 2026-10-05: personal health and fitness data, US first.** See section 8.1 and section 6.14. The original question: every surviving competitor narrowed. Employment, education, and identity credentials fit the existing organization tooling better than consumer fitness data. Choosing a wedge would sharpen Phase 2 and Phase 3.
6. Distribution model. **Decided in part 2026-10-05:** LucidData stays a destination product on every surface, with its own web app, mobile apps, and browser extensions. An embeddable path is not ruled out. The original question: DataSapien reaches consumers by embedding in brands' existing apps rather than asking them to adopt one. Decide whether LucidData stays a destination product, offers an embeddable path later, or accepts slower consumer growth funded by organization revenue. This shapes how much consumer acquisition work is worth funding.
7. Issuer onboarding vertical. **Deferred 2026-10-05,** together with LD-404, behind the health focus. LD-404 only answers "is this tradesperson insured" if an insurer or trade body issues that credential. Pick one vertical and secure a launch issuer before building the presentation flow, otherwise it ships with nothing authoritative to present. Trade licensing and professional indemnity are the closest fit to the existing issuer tooling.
8. Browsing data appetite. LD-207 is the highest-return and highest-risk item here. Decide whether LucidData wants to be in the browsing data market at all before LD-206 ships, because LD-206 builds the collection capability either way and the answer changes what is said to users at that point.
9. Platform fee level. LD-505 requires a number. A fee high enough to fund the service reduces what contributors earn, and contributor earnings are already modest: at current guidance a person in the financial category earns roughly 1.50 dollars per sale. Decide whether the marketplace is a revenue line or an acquisition feature funded by organization subscriptions, because that answer sets the fee and changes how the product should be described to users.
10. Verification pricing. Section 7.6 shows per-check fees are worth roughly twelve times more to an individual than pool sales, and the buyer compares them to a manual check rather than to a data feed. Decide the fee, the subject's share, and whether verification is metered separately from the organization subscription. This is the single highest-leverage pricing decision in the document and it should be settled before LD-404 is built, because it changes what that feature is for.
11. Health business model. Decide who pays on the organization side of a health product: research studies that recruit people and receive consented data under ethics review, tools for coaches and clinicians, or nobody for now. Selling to clinics may make LucidData a HIPAA business associate, which counsel should weigh before LD-305 grows an organization surface.
12. Reproductive and menstrual data. **Decided 2026-10-08: left out of LD-209 and out of the permissions the mobile app requests.** See section 8.1. The original question: decide whether to leave it out of LD-209 and the app's permissions entirely, or to hold it under stronger protections. In some US states it carries legal risk that other health data does not.
13. Mobile billing. Decide between web checkout linked from the US App Store build, which Apple guideline 3.1.1(a) permits on the US storefront, and in-app purchase. Recheck the guideline at submission, because it has changed recently and may change again.
14. Health records route. Decide between registering directly with each EHR over SMART on FHIR and using an aggregator for LD-211. An aggregator is faster but holds tokens between the person and the provider and becomes a disclosed subprocessor, the same trade-off that led to the 2026-07-26 decision against a connector aggregator.

### 8.1 Decisions taken

| Date | Decision | Consequence |
|---|---|---|
| 2026-07-26 | Android wearable data arrives through Health Connect, not per-vendor connectors | Samsung Health and Xiaomi have no server-to-server API, and Google Fit is closed to new developers and deprecated. Every Android-side wearable is therefore blocked behind LD-204 stage B, which raises its priority. See the decision note in LD-204 |
| 2026-07-26 | No connector aggregator | Terra, Rook, and Vital would collapse many providers into one integration but would hold provider tokens between the person and the provider. Rejected for now, and recorded in LD-201 so it is a considered position rather than an oversight |
| 2026-10-05 | The vertical is personal health and fitness data, US first | Closes open decision 5. Phases 3 and 4 were re-sequenced in section 6.14, and LD-110 to LD-112, LD-208 to LD-214, LD-305, and LD-608 to LD-612 were added |
| 2026-10-05 | Every surface is in scope: web, iOS, Android, and the Chrome, Edge, Firefox, and Safari extensions | LD-204 widens beyond capture and presentation, LD-212 covers store release, and section 1.2 was updated |
| 2026-10-05 | The mobile app is built with Expo and React Native | The portable crypto core from LD-204 stage A and the LD-609 shared package are reused rather than rewritten in Swift and Kotlin. Stages A and B ship together |
| 2026-10-05 | The Fitbit connector is retired | Google turns the Fitbit Web API off on 30 October 2026, and its successor has a waitlist. Fitbit data arrives through Health Connect and Takeout instead |
| 2026-10-05 | Health data is never sellable | Already enforced by the marketplace validation, and now a stated product position, which Apple guideline 5.1.3 and the provider terms require anyway. LD-111 removes the earnings claims from marketing |
| 2026-10-05 | The supported Node floor is 22 | Node 20 reached end of life in April 2026. Recorded in section 6.11 |
| 2026-10-05 | LD-404, LD-502, LD-207, and LD-403 wait behind the health work | None of them serves the health focus, and LD-404 also needs an issuer vertical that open decision 7 has deferred |
| 2026-10-08 | Reproductive and menstrual data get no health type and no mobile permission | Closes open decision 12. An entry's schema type is readable by the server, so a dedicated type would say what the entry holds even though its contents are encrypted, and in some US states this data carries legal risk that other health data does not. A person can still keep it in a custom entry, whose contents the server cannot read. Its label stays readable, as every label is. The LD-204 permission list excludes it |

## 9. Validation status

This spec is not final. The table records which validation exercises have been run against it and which
remain. Treat an unchecked row as a reason to hold the affected specs rather than build them.

| Exercise | Status | What it found |
|---|---|---|
| Competitor and adjacent market research | Done | Sections 3 and 10 |
| Standards and regulatory review | Done | Section 3, regulatory drivers |
| Implementation baseline audit | Done | Section 2 |
| Persona scenario walkthrough, 32 personas | Done | Section 4.1, produced LD-104 to LD-108, LD-405, LD-406, LD-603 to LD-605 |
| Unit economics and pricing model | Done | Produced section 7 and LD-505, and open decision 9 |
| Abuse and coercion modelling | Done | Produced LD-109, LD-506, LD-606 |
| Threat model | Done | Confirmed LD-605 and LD-406; residual risks recorded in LD-101 and LD-107 |
| Data lifecycle and deletion mapping | Done | Produced LD-607 |
| Dependency and capacity analysis | Done | Rebalanced phases; see the capacity note in section 6 |
| Spec testability review | Done | Resolved ambiguities in LD-104, LD-105, LD-207, LD-501, LD-405, LD-602 |
| Phase 1 implementation | Done 2026-07-26 | Eleven specs delivered. See section 6.1. Two acceptance criteria unmet and recorded, one implementation mechanism substituted |
| Phase 2 implementation | Done | All twelve specs delivered 2026-07-26, with LD-602 delivered in part. Both open defects closed, plus nine found during the work |
| Phase 3 implementation | In progress | LD-506 delivered, LD-204 stage A started, and LD-401 delivered in part, 2026-07-27. LD-110 apart from counsel's review, LD-610, LD-111, LD-609, LD-608, and LD-209 delivered 2026-10-08. See section 6.9. Two carried-over gaps closed on the way: the LD-602 SSRF guard now checks resolved addresses and refuses redirects, and the extension icons that blocked any store submission now exist |
| Phase 4 implementation | In progress | LD-203 delivered 2026-07-27, which closed the last open LD-205 criterion. See section 6.10. LD-404 cannot start until Phase 3 supplies LD-401, LD-402, and LD-204 stage A, and four further Phase 4 specs are blocked on open decisions rather than on work |
| Continuous integration | **Fixed 2026-07-27** | CI had failed on every run for thirty-four commits while production deployed cleanly, because Vercel runs only the build. The cause was a real portability defect in the crypto layer rather than a flaky test. See section 6.11 |
| Server action error transport | **Fixed in part 2026-07-27** | Every user-facing error message thrown from a server action was replaced by framework boilerplate in production, across the whole product. Invisible in development, because the sanitization is production-only. Infrastructure and the four highest-traffic surfaces are converted; the rest is mechanical. See section 6.13 |
| Health focus re-sequencing | Done 2026-10-05 | Section 6.14 and sixteen new specs. Checked against current sources: the Fitbit Web API shutdown, Supabase Auth's default email limits, browser support for extension APIs, Strava's API agreement, and the FTC, Washington, and Apple health rules |
| Legal review | **Not done** | Blocks open decisions 1, 9, 11, and 13, and parts of LD-107. LD-110's documents were drafted from primary sources and published on 2026-10-08 so that the product is not running without them, but counsel has not reviewed them, and every store submission should wait for that review |
| User and buyer interviews | **Not done** | LD-404 and LD-107 rest on unvalidated assumptions. So does the health focus: LD-214 and LD-305 assume what people want to see and share |
| Team pre-mortem | **Not done** | No strategic risk pass has been run |

### Defects found during validation

These were live defects in the codebase rather than missing features. Status updated 2026-10-08.

| Defect | Evidence | Owned by | Status |
|---|---|---|---|
| Organization registration is unauthenticated and returns a working API key | [app/api/org/register/route.ts](../app/api/org/register/route.ts) | LD-109 | **Fixed.** Registration requires a session and issues no key; keys come only after domain verification |
| `assertIssuanceQuota` is defined but never called, so plan limits are unenforced | [lib/services/billing.service.ts](../lib/services/billing.service.ts) | LD-109 | **Fixed.** Moved inside `issueCredential`, so the portal and API paths cannot diverge |
| Issued credentials survive account deletion with claims intact | `ON DELETE SET NULL` in [20260616000007_credentials.sql](../supabase/migrations/20260616000007_credentials.sql) | LD-607 | **Fixed** 2026-07-26. Credentials about the subject are deleted explicitly before the auth user, so verification fails closed |
| Order records survive account deletion with payload intact | `ON DELETE SET NULL` in [20260725150000_marketplace_transaction_integrity.sql](../supabase/migrations/20260725150000_marketplace_transaction_integrity.sql) | LD-607 | **Fixed** 2026-07-26. The payload is emptied and both source links cleared, leaving a counted placeholder with `redacted_at` set |
| Marketplace sales become loss-making above a computable pool size | Fixed access fee in [data-order.service.ts](../lib/services/data-order.service.ts) against percentage processing costs | LD-505 | **Fixed.** 25% fee plus a minimum order, asserted profitable across eight pool sizes and every category |
| `interests` and `other` categories have a zero access fee, so every sale loses money | [lib/constants/data-pricing.ts](../lib/constants/data-pricing.ts) | LD-505 | **Fixed.** Both repriced off zero |
| Production errors were never recorded | The production branch of [lib/services/error-logger.ts](../lib/services/error-logger.ts) was a TODO | LD-610 | **Fixed** 2026-10-05. One scrubbed JSON line per event |
| Preview deployments held production secrets | `SUPABASE_SERVICE_ROLE_KEY` and `ISSUER_KEY_SECRET` were scoped to Vercel's Preview environment | LD-610 | **Fixed** 2026-10-06. Production secrets are production only, and previews use a staging project with keys of their own |
| Email ownership is never verified | Supabase Auth auto-confirmed sign-ups, while [credential.service.ts](../lib/services/credential.service.ts) matches credentials to accounts by email | LD-610 | **Fixed** 2026-10-08. Production requires confirmation. Registration no longer signs in straight after sign-up; the vault's salt and recovery code are created on the first sign-in after the address is confirmed, which is when the password is next in hand |
| Step-up confirmation sent the password to the server | `requestStepUpAction` in [session-security.actions.ts](../lib/actions/session-security.actions.ts) signed in on the server with the submitted password | LD-610 | **Fixed** 2026-10-05. The browser signs in with Supabase and sends a single-use proof; the server never receives the password |
| The service worker cached cross-origin responses | Serwist's default rules kept Supabase responses and third-party scripts for an hour | LD-610 | **Fixed** 2026-10-05. Cross-origin requests always go to the network, and the cache an older worker filled is deleted |
| Password-reset links could redirect to a stranger's preview deployment | Wildcard `*.vercel.app` entries in the Supabase redirect allowlist | LD-610 | **Fixed** 2026-10-05, **regressed**, and fixed again 2026-10-08. The Supabase Vercel integration rewrites the allowlist on every Vercel deployment, so the next deploy put `https://lucid-*-data-lucid-data.vercel.app/**` back. Supabase's `*` matches hyphens, so a stranger's Vercel team named like `x-data-lucid-data` would have matched. The integration's project connection is removed, and the allowlist stayed at the one recovery URL through the next production deployment |
| Sign-in could send people to another site | `/login` and `/two-factor` trusted the `redirectedFrom` query value | LD-610 | **Fixed** 2026-10-05. Only same-site paths are accepted |
| Health data could be sold through a pool of another category | [contribution.service.ts](../lib/services/contribution.service.ts) checked the pool's category but never the vault entry's, and the vault offered sale toggles on health entries | LD-111 | **Fixed** 2026-10-08. The stored entry decides, by category or schema type, in the service, the release, the evaluation, and the database. Any such contribution was withdrawn, with a notice to the person |
| A signed-in person could change the address other features find them by | `users_update_own` allowed every column through PostgREST, and credential issuance, requests, and passkey sign-in look people up by `users.email` | LD-610 | **Fixed** 2026-10-08. Signed-in sessions can update only profile and key columns; the address follows the sign-in address, and any changed one was restored |
| Contributions and their payouts could be written directly | `pool_contributions_insert_own` and `_update_own` let a person set `payout_cents`, the payload, and the schema type, and payouts were paid from the stored value | LD-506 | **Fixed** 2026-10-08. Only the contribution service writes contributions. A release pays at most the pool's price per record, and stored payouts and unpaid transfers above it were reset |
| Anyone could share someone else's credential | `cs_all_own` let a person insert a share for any credential, and the public verify page did not check the share's owner against the credential's subject | LD-111 | **Fixed** 2026-10-08. The server writes shares, only for the subject and only in answer to a request sent to them; the verify page and request view check both; stray shares were revoked |
| Health data could be stored without consent | The LD-110 consent check ran in the vault service, but `vault_all_own` allowed a direct insert | LD-110 | **Fixed** 2026-10-08. The database refuses health data from a signed-in session without current consent |
| The person answering a request could rewrite its terms | `cr_update_own` and `credreq_update_own` allowed every column | LD-610 | **Fixed** 2026-10-08. Only the response columns can change |
| A person could file a rights case with any status or deadline | "Users file their own rights cases" allowed a direct insert, although the table's own comment said only the service role moves a case, and an appeal could point at someone else's case | LD-301 | **Fixed** 2026-10-08. Only the server files cases, and it checks that an appeal contests the person's own refusal |
| A recovery kit could not open the vault | The [recover page](<../app/(auth)/recover-vault/page.tsx>) read only the recovery code's escrow, so the LD-105 kit was stored and never used. The terms and the privacy policy told people a kit would get them back in | LD-105 | **Fixed** 2026-10-08. Recovery takes a code or a kit, and each copy is checked against the vault's oldest entry before anything changes |
| Recovery factors stayed listed after they stopped working | A password change or a recovery gives the vault a new master key, and every factor wraps the old one, so each failed afterwards while settings still listed it | LD-105 | **Fixed** 2026-10-08. The re-wrap retires every factor, the person is told when kits stopped working, and a new code replaces the old one |
| A mistyped recovery code changed the password anyway | The recover page changed the password before it checked the code, and trying again failed on Supabase's same-password error | LD-105 | **Fixed** 2026-10-08. The code or kit is checked first, a retry is accepted, and a recovery that already finished is recognized |
| A lost response after a stored re-wrap could lock the vault | Changing the password rolled it back on any error, including one raised after the server had stored the new wrapping, which leaves every entry under a key no password derives | LD-105 | **Fixed** 2026-10-08. Nothing after the stored re-wrap reports an error, and the browser checks whether the vault already opens with the new key before it rolls anything back |
| Step-up protected two of the six actions it listed | `STEP_UP_ACTIONS` named export, consent revocation, password change, and adding a recovery factor, but only account deletion and session revocation checked a grant, and removing a factor asked for nothing. A warm session could also retire every factor by sending the vault's key envelopes back unchanged | LD-106 | **Fixed** 2026-10-08. Export, password changes and recovery, adding a kit, replacing the recovery code, and removing a factor each consume a grant in the service, and a test fails if a listed action is not consumed. Consent withdrawal stays one step on purpose, because withdrawing consent must be as easy as giving it |
| A password change stranded every synced record | LD-201 wraps the connector ingestion private key under the master key itself, and neither a password change nor a recovery re-wrapped it, so records a sync sealed afterwards could never be opened and a new key could not be published over the old one | LD-201 | **Fixed** 2026-10-08. The key moves with the entries in every re-wrap, and recovery counts it as vault content: it checks a recovered key when there are no entries, and a reset without a code keeps the factors it still needs. A key that an earlier password change already stranded stays unreadable. Recovery with the current code still works on those accounts and says so, and replacing the key waits on LD-208 |
| A content edit during a reset could be overwritten with an old data key | The re-wrap stores each envelope by id without checking it is still the one that was re-wrapped, and the reset now prepares envelopes before it waits on the password proof | LD-105 | **Fixed** 2026-10-08. Every re-wrap goes through `rewrap_vault_keys` (`20261008150000_close_recovery_writes.sql`), which replaces each envelope only if it is still the one the browser read, and moves the connector key in the same transaction. A change made meanwhile refuses the whole re-wrap with `conflict`, and the person tries again |
| Recovery alerts misreported what happened | One new recovery code sent two alerts, and adding a kit told the person their previous code no longer worked | LD-105 | **Fixed** 2026-10-08. One alert per change, with its own wording for kits, removals, and kits retired by a password change |
| Typed vault entries were never checked against their schema | `SCHEMA_VALIDATORS` in [vault-schemas.ts](../packages/core/src/schemas/vault-schemas.ts) had no caller, so a medical record or a workout could hold any shape, and the server cannot check ciphertext | LD-209 | **Fixed** 2026-10-08. The browser checks every typed record before it encrypts it, on create, edit, and import |
| Two vault form controls did nothing or could not be told apart | The create and edit dialogs collected a "Data Type" that was never sent or stored, and a screen reader announced it with the same name as the type selector. The edit dialog offered the type as free text, which the client API does not allow to change | LD-209 | **Fixed** 2026-10-08. The dead control is gone, and the edit dialog shows the type the entry was created with |
| A signed-in session could replace or clear the recovery escrow and recovery factors directly | The users column grant included `wrapped_master_key` and `recovery_code_salt`, and `recovery_factors_all_own` allowed every write, so a direct write skipped the step-up check, the audit entry, and the alert. The key salt was already write-once, but a session could still set the first one | LD-106 | **Fixed** 2026-10-08. The services write these through the service role, and `20261008150000_close_recovery_writes.sql` removes the direct grants; `recovery-writes.test.sql` holds them closed |
| A vault write stored any column the request named | `createVaultEntryAction` and `updateVaultEntryAction` passed their payload to the service unparsed, and the service spread it into the insert and the update, with the caller's keys after the session's user id on insert. Row level security stopped a write to another person's row, but a person could set their own entry's schema type, provenance, or timestamps, which the client API refused | LD-608 | **Fixed** 2026-10-08. Both actions parse with the client API's schemas, and the service copies only the columns each write may set, with the owner taken from the session |
| A synced record's own name was stored in the clear | LD-201 seals a provider's name for a record because LD-501 classifies it as an identifier, but the drain in [usePendingIngest.ts](../lib/hooks/usePendingIngest.ts) wrote it back out as the entry's label, which the server can read | LD-201 | **Fixed** 2026-10-08, before any production sync, because the Strava app has never been configured. Synced entries and entries imported from a provider export are labelled by type. The name stays in the encrypted data, and the vault list shows it from there |
| A record stored before its queue row was cleared stayed queued for good | The vault's unique index refuses a second copy of a synced record, but the refusal reached the drain as an unexplained failure, so a drain that stopped between storing and clearing retried and failed on every unlock. The client API reported the same refusal as a server fault | LD-202 | **Fixed** 2026-10-08. The service answers `already_stored`, a 409 in the API, and the drain counts the record as done. The sync worker now checks the vault before it queues a record, because every sync fetches the latest activities again and the queue's own unique key cannot see a record the drain has cleared |
| A claimed credential could be saved only from the web app | Claiming a credential saves a copy with schema type `verifiable_credential`, which the registry did not list, so the client API refused it. The web action never checked the type | LD-608 | **Fixed** 2026-10-08. The type is registered as one the app writes itself, so any client can store it, and it is never offered for manual entry, import, issuance, or requests. Tracker summaries, which the organization portal offered as a credential type, are treated the same way |
| An emptied description was never cleared | The edit dialog sent nothing when the description was empty, so text a person removed from a readable column stayed on the server | LD-110 | **Fixed** 2026-10-08. An emptied description is sent and cleared |
| Saving a tracker summary could report success when nothing was saved | The dashboard panel ignored a refusal from the vault, such as a new vault's request to set up recovery first, then said the summary was saved and deleted it from the extension | LD-206 | **Fixed** 2026-10-08. The summary is cleared only once the vault holds it, and a refusal is shown |

Every defect found during validation is fixed. The two GDPR Article 17 defects, where a deleted
account kept credential claims and contributed record payloads, were closed by LD-607 on 2026-07-26.
Deletion no longer relies on foreign key behaviour: what does not cascade is handled explicitly, the
result is verified rather than assumed, and the person receives a signed receipt.

The last seven rows were found on 2026-10-08 while checking that health data could not be sold, and
the six after the first share one cause. A row level security policy also governs direct API access:
PostgREST exposes every public table, so whatever a policy allowed, a signed-in person could do with
their own session and the public key, skipping every check in the server. Policies written as "the
owner may write their own rows" handed people columns the server was meant to set. Each was reproduced
against a local stack before it was fixed, and `supabase/tests/database/direct-write-guards.test.sql`
now holds every one closed. The rule for new tables is in AGENTS.md.

The nine recovery rows were found on 2026-10-08 while adding recovery to the client API. The
recovery module had no tests at all, so a kit that opened nothing looked like working code. It now
has known-answer vectors produced outside this codebase, and an end-to-end test resets a password and
restores a vault with a kit.

The last six rows were found on 2026-10-08 while checking the vault's write path after LD-209. Moving
the vault actions onto the client API's schemas is what exposed them, because the same requests that the
API refused had been passing through the web app.

### Before this spec is considered final

1. Legal review of the questions in open decisions 1 and 9, plus US state data broker registration, FCRA exposure if credentials inform hiring, and money transmission on payouts. Since 2026-10-05, also the US health privacy obligations in LD-110: the FTC Health Breach Notification Rule, the Washington My Health My Data Act, and state laws such as California's CMIA.
2. Interviews with prospective users and at least one institutional buyer, to test the LD-404, LD-107, LD-214, and LD-305 assumptions before funding them.
3. A team pre-mortem.

## 10. Source index

All sources checked 2026-07-25. Vendor claims are labelled as reported in the sections above.

Direct competitors: [Inrupt](https://www.inrupt.com/products/enterprise-wallet-infrastructure), [Inrupt wallet docs](https://docs.inrupt.com/wallet/introduction), [Solid](https://solidproject.org/about), [Meeco vault](https://www.meeco.me/vault), [Meeco security](https://www.meeco.me/security), [Mydex](https://mydex.org/), [digi.me](https://digi.me/), [Dataswyft](https://www.dataswyft.com/), [Cozy](https://en.cozy.io/), [Cozy security](https://docs.cozy.io/en/cozy-stack/security/), [Vana docs](https://docs.vana.org/), [Vana confidential compute](https://docs.vana.org/applications/confidential-compute), [Reklaim](https://reklaimyou.com/how-it-works), [Reklaim privacy policy](https://reklaimyou.com/privacy), [Gener8](https://gener8ads.com/), [CitizenMe](https://www.citizenme.com/), [DataSapien](https://datasapien.com/about/), [DataSapien platform](https://datasapien.com/).

Adjacent products: [Optery pricing](https://www.optery.com/pricing/), [Optery security](https://www.optery.com/optery-security/), [Incogni](https://incogni.com/), [DeleteMe plans](https://joindeleteme.com/privacy-protection-plans/), [Permission Slip](https://permissionslipcr.com/), [Plaid Link](https://plaid.com/docs/link/), [Terra docs](https://docs.tryterra.co/), [Terra pricing](https://tryterra.co/pricing), [Apple Health](https://support.apple.com/en-us/108779), [Health Connect](https://developer.android.com/health-and-fitness/health-connect), [SpruceID Verify](https://docs.verify.spruceid.com/getting-started/overview/), [Entra Verified ID](https://learn.microsoft.com/en-us/entra/verified-id/introduction-to-verifiable-credentials-architecture), [EUDI ARF](https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework), [Snowflake sharing](https://docs.snowflake.com/en/user-guide/data-sharing-intro), [AWS Data Exchange](https://docs.aws.amazon.com/data-exchange/latest/userguide/what-is.html), [Databricks Clean Rooms](https://docs.databricks.com/aws/en/clean-rooms/), [BigQuery sharing](https://cloud.google.com/bigquery/docs/analytics-hub-introduction).

Regulatory and standards: [EDPB access guidelines](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en), [EDPB portability](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-right-data-portability-under-regulation-2016679_en), [EDPB consent](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en), [CCPA](https://oag.ca.gov/privacy/ccpa), [GPC](https://oag.ca.gov/privacy/ccpa/gpc), [UK DUAA](https://www.gov.uk/guidance/data-use-and-access-act-2025-data-protection-and-privacy-changes), [Data Governance Act](https://digital-strategy.ec.europa.eu/en/policies/data-governance-act), [Data Act](https://digital-strategy.ec.europa.eu/en/policies/data-act), [EUDI regulation](https://digital-strategy.ec.europa.eu/en/policies/eudi-regulation), [VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/), [OpenID4VCI](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html), [OpenID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html), [RFC 9901 SD-JWT](https://www.rfc-editor.org/rfc/rfc9901.html), [CFPB 1033 reconsideration](https://www.consumerfinance.gov/rules-policy/rules-under-development/personal-financial-data-rights-reconsideration/), [FHIR R4](https://hl7.org/fhir/R4/http.html), [SMART App Launch](https://hl7.org/fhir/smart-app-launch/).

Added 2026-10-05 for the health focus: [Fitbit Web API](https://dev.fitbit.com/build/reference/web-api/), [Google Health API](https://developers.google.com/health), [Google Data Portability API](https://developers.google.com/data-portability), [Meta data portability](https://developers.facebook.com/docs/data-portability/), [Strava API agreement](https://www.strava.com/legal/api), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [MDN extension background key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [MDN compatibility data for the downloads API](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/downloads.json), [FTC Health Breach Notification Rule](https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule), [Washington My Health My Data Act](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy), [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
