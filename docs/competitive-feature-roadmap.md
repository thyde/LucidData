# Competitive feature roadmap

Research date: 2026-07-25
Last delivery update: 2026-07-26
Status: active. **Phase 1 is delivered. Phase 2 is seven specs in.**
Phase 1: [section 6.1](#61-phase-1-delivery-record) for the record, [section 6.2](#62-implications-for-later-phases) for what changed underneath the remaining specs.
Phase 2: [section 6.4](#64-phase-2-delivery-record) for the record, [section 6.5](#65-a-defect-found-while-building-phase-2) for a defect found on the way, and [section 6.6](#66-what-is-left-in-phase-2) for what remains and in what order.
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
- Full native clients that duplicate the web application. LD-204 is scoped to capture and presentation that the web cannot perform.
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
| Browser-side envelope encryption, PBKDF2 600k plus AES-GCM | [lib/crypto/key-derivation.ts](../lib/crypto/key-derivation.ts), [lib/crypto/client-crypto.ts](../lib/crypto/client-crypto.ts) |
| Vault CRUD with typed schema forms and a custom field builder | [lib/actions/vault.actions.ts](../lib/actions/vault.actions.ts), [components/vault/key-value-builder.tsx](../components/vault/key-value-builder.tsx) |
| File import with column mapping, parsed in the browser | [lib/vault/import-parsers.ts](../lib/vault/import-parsers.ts), [components/vault/vault-import-dialog.tsx](../components/vault/vault-import-dialog.tsx) |
| Time-bound consent with a required purpose | [lib/validations/consent.ts](../lib/validations/consent.ts) |
| Hash-chained audit log with tamper verification | [lib/crypto/hashing.ts](../lib/crypto/hashing.ts) |
| JSON-LD vault export decrypted in the browser | [lib/crypto/vault-export.ts](../lib/crypto/vault-export.ts) |
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
| LD-104 | No access path when a user dies or loses capacity | 5 | 2 | 5 | 4 | 3 | 4 | verified | P1 |
| LD-405 | Incorrect credentials cannot be corrected or superseded | 4 | 5 | 3 | 4 | 3 | 3 | verified | P1 |
| LD-605 | Privileged access is unattributed and the audit chain is not anchored | 2 | 5 | 4 | 5 | 3 | 4 | verified | P1 |
| LD-604 | No bulk or asynchronous organization operations | 1 | 5 | 2 | 2 | 5 | 3 | verified | P1 |
| LD-108 | No accessibility conformance evidence | 3 | 4 | 1 | 3 | 3 | 3 | verified | P1 |
| LD-506 | Payouts can be farmed with fabricated or duplicated data | 2 | 4 | 2 | 4 | 3 | 3 | verified | P1 |
| LD-606 | No way to report, block, or suspend a bad actor | 3 | 3 | 2 | 4 | 2 | 3 | verified | P1 |
| LD-206 | Users cannot see who is collecting data on them | 5 | 2 | 5 | 5 | 3 | 3 | inferred | P1 |
| LD-404 | Credentials cannot be presented or checked in person | 5 | 4 | 5 | 4 | 4 | 4 | inferred | P1 |
| LD-204 | Health platform data is unreachable from a browser | 5 | 3 | 4 | 3 | 4 | 5 | verified | P1 |
| LD-401 | Credentials are not standards-interoperable | 3 | 5 | 5 | 4 | 4 | 5 | verified | P1 |
| LD-502 | Marketplace ships copies, not governed access | 3 | 5 | 5 | 5 | 5 | 5 | verified | P1 |
| LD-402 | No derived proofs such as age or income band | 4 | 5 | 5 | 4 | 4 | 4 | verified | P1 |
| LD-202 | No sync health surface or provenance | 4 | 3 | 3 | 4 | 2 | 3 | verified | P1 |
| LD-503 | Buyers cannot evaluate supply before purchase | 2 | 5 | 3 | 3 | 5 | 3 | verified | P1 |
| LD-304 | Export exists but import round-trip does not | 4 | 2 | 4 | 4 | 2 | 3 | verified | P1 |
| LD-103 | No vault search at scale | 4 | 1 | 2 | 2 | 2 | 3 | verified | P2 |
| LD-403 | No delegation or household roles | 3 | 3 | 3 | 3 | 3 | 4 | inferred | P2 |
| LD-203 | No provider export adapters | 4 | 2 | 3 | 2 | 3 | 4 | verified | P2 |
| LD-504 | No offer targeting | 2 | 4 | 2 | 2 | 4 | 3 | verified | P2 |
| LD-205 | Provider exports are abandoned partway | 3 | 2 | 2 | 2 | 2 | 3 | inferred | P2 |
| LD-207 | Browsing data cannot be contributed or earned from | 3 | 4 | 3 | 2 | 4 | 4 | inferred | P2 |

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
- [ ] Support severity levels and target response times are published.
- [ ] The residency statement names the actual hosting region and any subprocessor locations.
- [ ] Recovery objectives are stated and have been tested at least once.
- [ ] The incident response runbook names roles and includes breach notification templates.
- [ ] Certification status is unambiguous, with achieved and planned clearly separated.
- [ ] Business continuity states what happens to user data if the service ends, including the export path.

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
- [ ] Primary flows are operable by keyboard alone.
- [ ] Primary flows pass automated accessibility checks in CI, and violations fail the build.
- [ ] Form controls have programmatic names, and errors are announced.
- [ ] Colour is never the sole carrier of meaning, which matters for consent and verification states.
- [ ] An accessibility statement is published with known limitations.

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

### LD-201 Connector framework with zero-knowledge ingestion

Priority: P0. Effort: large. Depends on: LD-102 for failure notices.

Rationale. This is the adoption gap. Cozy has a connector catalog, Plaid and Terra have made embedded connection flows the expected pattern, and Gener8 and Reklaim win users purely on easy acquisition. LucidData currently requires manual entry or file import, so a new vault is empty and stays empty. [lib/connectors/fitness.ts](../lib/connectors/fitness.ts) has normalization functions and OAuth metadata for Strava and Fitbit but no callback routes, no token storage, and no sync. The design already exists in [docs/vault-data-ingestion.md](vault-data-ingestion.md).

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
- `lib/crypto/ingestion-keys.ts`: keypair generation, wrap, unwrap, seal, open. Browser only.
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
- [ ] Each connected source shows status, last successful sync, and last error.
- [ ] A broken source is visually distinct and offers reconnect.
- [ ] Imported entries display their provider and capture time.
- [ ] Revoking consent states that already-delivered copies are not recalled.
- [ ] Provenance fields never contain record content.

Tests. Unit tests for freshness formatting. A test that provenance fields reject content-bearing values. A component test for the error state.

---

### LD-203 Provider export adapters

Priority: P2. Effort: medium. Depends on: LD-201 for the normalization interface.

Rationale. OAuth connectors cover a narrow set of providers. Bulk exports cover the long tail without API agreements, and Cozy's connector catalog shows that breadth of acquisition drives retention. This also unblocks health data before any FHIR work.

Scope. Adapters for Google Takeout, Apple Health export XML, and a generic bank CSV. All parsing in the browser, reusing the existing import pipeline.

Implementation. Add `lib/vault/adapters/` with one pure module per provider exposing `detect(file)` and `parse(file)` returning the same shape [lib/vault/import-parsers.ts](../lib/vault/import-parsers.ts) already produces. Extend [components/vault/vault-import-dialog.tsx](../components/vault/vault-import-dialog.tsx) to auto-detect and preview.

Acceptance criteria.
- [ ] Each adapter parses a fixture export and produces typed entries.
- [ ] Parsing happens entirely in the browser.
- [ ] Files larger than the current 1000-record cap stream or chunk rather than failing.
- [ ] Unrecognized files fall back to the existing mapping wizard.

Tests. Fixture-based unit tests per adapter, including a malformed file and a very large file.

---

### LD-204 Mobile application

Priority: P1. Effort: large. Depends on: stage A none, stage B requires LD-201.

Rationale. The app earns its place twice, for reasons that are independent of each other.

First, acquisition. Apple HealthKit and Android Health Connect have no web API, so the data behind them
is permanently unreachable from a browser. LucidData already defines `fitness_activity` and
`fitness_daily` schema types in [lib/schemas/vault-schemas.ts](../lib/schemas/vault-schemas.ts) with no
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
- Reuse `lib/schemas/`, `lib/validations/`, and the connector normalization functions unchanged.
- Derive the master key with identical PBKDF2 parameters and the same `users.key_salt`, so one vault opens on both surfaces.

Security.
- Wrapped key material goes in Secure Enclave or Keystore. Never in plain preferences, and never synced to a platform cloud backup.
- Biometric unlock releases the wrapped key. It does not replace the password as the root secret, so a stolen unlocked device does not yield the master key on another device.
- Health data is sensitive. It must be encrypted before it reaches storage, and must not appear in crash reports, analytics, or logs.
- Request the narrowest permission set, and re-request rather than caching a broad grant.

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
- [ ] A fresh install holds no permission that permits reading general browsing activity.
- [ ] Enabling a tier triggers a browser permission prompt, and declining leaves the tier off.
- [ ] Revoking a tier removes the browser permission, verified by querying the permission state.
- [ ] Walkthroughs complete an export request for each supported provider.
- [ ] A completed export reaches the import flow without a server round trip.
- [ ] Uninstalling leaves no residual permission or stored data.

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
- [ ] Tracker detection runs entirely on device and issues no network request to perform analysis.
- [ ] The user sees per-site and aggregate collection reporting within one browsing session.
- [ ] Sensitive-category domains are excluded from persisted records by default and this is stated in the UI.
- [ ] Only registrable domains are stored. A test asserts no query string, fragment, or path is persisted.
- [ ] Findings written to the vault use the standard encrypted envelope.
- [ ] The extension sends Global Privacy Control on supported requests.
- [ ] A detected collector can be escalated into an LD-301 rights case with one action.

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
- `lib/validations/rights.ts`, `lib/repositories/rights.repository.ts`, `lib/services/rights.service.ts`, `lib/actions/rights.actions.ts`.
- Deadline calculation in a pure module `lib/utils/rights-deadlines.ts` so it is testable. One month base, extension where permitted, and stop-the-clock on a clarification request per UK DUAA.
- `app/(dashboard)/privacy/page.tsx` for the user surface.
- Reuse [lib/crypto/vault-export.ts](../lib/crypto/vault-export.ts) for portability fulfilment.

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
- `lib/vault/portable-import.ts` reversing [lib/crypto/vault-export.ts](../lib/crypto/vault-export.ts).
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
- [ ] A credential can be issued as VC 2.0 and verifies with an external validator.
- [ ] SD-JWT VC issuance and verification pass digest disclosure, decoy, and key-binding tests.
- [ ] An unknown format fails closed with an explicit error.
- [ ] Original signed bytes are preserved and re-verifiable after storage.
- [ ] Replay of a presentation is rejected.
- [ ] Existing Ed25519 credentials continue to verify.

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
- `lib/privacy/quasi-identifiers.ts` classifying every field in [lib/schemas/vault-schemas.ts](../lib/schemas/vault-schemas.ts) as identifier, quasi-identifier, sensitive, or safe. Fields from user-defined custom schemas have no classification and therefore default to sensitive, which excludes them from release until someone classifies them explicitly. Failing closed is the only safe default here.
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
- [ ] The same vault entry cannot be contributed twice to one pool.
- [ ] Contribution velocity limits are enforced per user.
- [ ] Payouts above the threshold are held pending review and are visible to the contributor as held.
- [ ] A pool reports how much of its supply is issuer-vouched against self-asserted.
- [ ] Fraud signals are audited.

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
- Generate the specification from the existing Zod schemas in `lib/validations/` so it cannot drift from the implementation.
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
| LD-101 | Yes | [lib/constants/trust-disclosures.ts](../lib/constants/trust-disclosures.ts) is the single source. A Vitest test fails the build if any module in `lib/crypto/` has no key-custody entry, which makes the page self-maintaining rather than a document that rots |
| LD-303 | Yes | Receipts are append-only and chained by `supersedes_receipt_id`. A new `platform_keys` table holds the receipt signing key under the same custody model as issuer keys. **This makes `ISSUER_KEY_SECRET` required for consent, not just credential issuance** |
| LD-601 | Yes, with one criterion unmet | Jobs: payout retries with exponential backoff, consent expiry, share expiry, rate-limit purge. **Connector token refresh was not implemented** because there is no `data_sources` table until LD-201. The runner has a job registry so it slots in without restructuring |
| LD-603 | Yes | Single-use hashed invitation tokens bound to the invited address. Last-owner protection on both demote and remove. This is the first time the owner / issuer_admin / verifier / member role model has been reachable at all |
| LD-109 | Yes | Organization registration now requires a session and issues no API key; keys come only after domain verification. `assertIssuanceQuota` moved inside `issueCredential` so no path bypasses it. Rate limiting is Postgres-backed and fails open with a log rather than taking the product offline |
| LD-302 | Yes | Signal recorded once and audited once, from either the header or `navigator.globalPrivacyControl`. A deliberate opt-in afterwards is recorded as a distinct event so it is never confused with the signal going away |
| LD-105 | Yes | Two independent factors: the printed recovery code and a downloadable recovery kit. The first-write block only fires when recovery setup actually failed, because registration already enrolls a code. That is the intended safety net rather than a new speed bump |
| LD-106 | Yes | Idle lock clears the key itself, not a flag. Step-up grants are single use, expire in 120 seconds, and name one action, so a confirmation cannot be reused. Session listing and revocation run through `auth.uid()`-scoped `SECURITY DEFINER` functions because PostgREST does not expose the auth schema |
| LD-406 | Yes | `verifyIssuedCredential` now selects the key by the credential's `key_id` rather than by whichever key is active, so rotation no longer invalidates history. The result shape changed to `{valid, reasons, warnings}` |
| LD-505 | Yes, with one mechanism substituted | 25% platform fee, $50 minimum order enforced in both the service and a database constraint, $25 payout threshold with the balance paid out on account closure. `interests` and `other` were repriced off a zero access fee. Profitability is asserted by a table-driven test across eight pool sizes and every category |

Two acceptance criteria were not met as written. Both are recorded here rather than quietly dropped.

1. **LD-601, connector token refresh.** Blocked, not skipped. There is no `data_sources` table to
   refresh tokens for. Add the job to `JOB_NAMES` in
   [lib/services/scheduled-jobs.service.ts](../lib/services/scheduled-jobs.service.ts) as part of LD-201.
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
- The trust-disclosure test asserts that every module in `lib/crypto/` has a key-custody entry. Adding `lib/crypto/ingestion-keys.ts` **will fail the build** until [lib/constants/trust-disclosures.ts](../lib/constants/trust-disclosures.ts) gains a matching entry in the same pull request. This is intended: the spec already requires disclosing `CONNECTOR_TOKEN_SECRET` as a server-held key, and the test now enforces it.
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
5. **An email transport should be configured.** The code path is complete and the org portal warns when it is not, but with no transport nothing is delivered. Still unset in production, so LD-102 is built but inert.

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

Status: seven of twelve delivered. Delivery is tracked in [section 6.4](#64-phase-2-delivery-record), and what remains is sequenced in [section 6.6](#66-what-is-left-in-phase-2).

- LD-107 assurance and procurement pack (delivered)
- LD-602 organization developer surface (delivered in part)
- LD-201 connector framework
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
| LD-501 real anonymization guarantees | Delivered 2026-07-26 | `lib/privacy/quasi-identifiers.ts` classifies every field of all seven built-in schemas as identifier, quasi-identifier, sensitive, or safe, each with a written reason, and a test derives the field list from the Zod schemas so an unclassified field fails the build. `lib/privacy/k-anonymity.ts` does full-domain generalization with ladders for dates, years, numerics, and categories, computes equivalence classes, suppresses records below k, and refuses rather than warns. `lib/privacy/differential-privacy.ts` adds seeded Laplace noise and a per-pool epsilon budget that blocks aggregate release on exhaustion. The gate runs in `startPoolPurchase` before pricing and before Checkout, and every order stores its privacy report. `pool_contributions.schema_type` now travels with each contribution, because a broad data category is not enough to classify a field. | Governed access instead of copies is LD-502 and unchanged. The epsilon budget is implemented and tested but has no aggregate query surface to spend it on yet; that arrives with LD-502. |
| LD-301 rights and data subject request engine | Delivered 2026-07-26 | `lib/utils/rights-deadlines.ts` is a pure deadline engine covering EU, UK, and California, with calendar-month arithmetic that clamps to month end, permitted extensions, and a clock that stops only where the jurisdiction allows it. `rights_cases` and `rights_case_events` carry the case model and its append-only evidence, with a database trigger that rejects UPDATE and a REVOKE that stops any API-role delete, while still permitting the cascade from an erased account. `lib/services/rights.service.ts` handles file, pause, resume, extend, resolve, withdraw, and appeal; a refusal must state its reason, and an appeal becomes its own case with its own clock. `app/(dashboard)/privacy/page.tsx` is the user surface, linked from both navigations. | There is no operator queue UI. Pause, resume, extend, and resolve exist as service functions with no action or screen behind them, deliberately: a person must not be able to advance their own case, and an operator console is its own piece of work. Verification of identity is not modelled beyond the `verifying` status. |
| LD-107 assurance and procurement pack | Delivered 2026-07-26 | `lib/constants/assurance.ts` is the single source for residency, support severities and response targets, availability, recovery objectives, the incident runbook with named roles and breach templates, processing-agreement positions, continuity, and the standard security questionnaire. Published at `/trust/assurance` and linked from the trust centre. Tests assert that nothing untested is described as tested, that the questionnaire cannot contradict the certification list, that every subprocessor has a stated processing region, that the 72-hour Article 33 deadline survives an edit, and that both sub-pages stay linked from `/trust`. | No countersigned data processing agreement, because that needs legal review, which section 9 still records as not done. No recovery drill has been run, so the objectives are published as design targets and say so. Availability is a target with no measurement and no credit scheme, stated as such. |
| LD-602 organization developer surface | Delivered in part 2026-07-26 | The OpenAPI 3.1 document at `/api/org/openapi` is generated from the same Zod schemas the handlers validate against, which are now shared in `lib/validations/org-api.ts` so the two cannot drift. It documents the LD-109 breaking changes honestly: registration needs a session and returns no key, and consent-request answers a neutral 202 rather than a 404 that would leak account existence. `lib/services/webhook.service.ts` adds signed outbound delivery: HMAC-SHA256 over `${timestamp}.${body}`, a 300-second replay window, exponential backoff to eight attempts on the LD-601 runner, secrets stored hashed, and an SSRF guard that refuses loopback, RFC 1918, carrier-grade NAT, link-local including the cloud metadata address, IPv6 unique-local, bare hosts, and embedded credentials. Payloads carry identifiers and timestamps only, enforced at runtime by a recursive check and at build time by a test. Consent request answers emit an event instead of forcing the buyer to poll. | No generated TypeScript client and no sandbox mode. Both are real work rather than omissions of convenience: a client needs a package and a release process, and a sandbox needs isolated data that provably cannot read production rows, which is the part worth doing carefully. There is no organization UI for managing webhook endpoints yet; `createWebhook` exists as a service function. |

Notes on LD-607 that affect later work.

- The manifest test is a build gate. Any later spec that adds a table (LD-201 `data_sources`, LD-301 request records, LD-205 extension state) must add a `DELETION_MANIFEST` entry in the same change or the suite fails. That is the intended behaviour, not an obstacle.
- Deletion now returns a signed receipt object rather than `void`. Any caller of `deleteAccount` or `deleteAccountAction` must handle the return value.
- `data_order_records.payload` can now be `{}` with `redacted_at` set. Buyer-facing export code must tolerate a redacted placeholder rather than assuming every record has content. LD-503 buyer evaluation surface and LD-502 must both account for this.
- Retention windows are published on the trust centre, so changing a constant in `lib/constants/retention.ts` changes a public promise. Treat those values as a disclosure, not a tuning knob.
- Audit chains are per user, which is what makes erasure and chain integrity compatible. Any move to a single global chain would break the right to erasure and must not be made without redesigning both.

Notes on LD-501 that affect later work, and one finding that needs a decision.

- **The sellable surface of the marketplace has narrowed, and this is the point.** Unclassified fields fail closed, so a pool of free-form custom-schema fields now releases nothing and the purchase is refused. Crossed with the restricted categories in `lib/validations/marketplace.ts` (health, financial, location, browsing are not sellable), the only data that can be sold today is the `credentials` category backed by the `employment`, `education`, and `identity` schemas. The marketplace lifecycle e2e was rewritten onto `employment` for exactly this reason. Anyone who wants `interests`, `personal`, or `other` pools to work has to classify those fields first. That is a product decision, not a bug, and it should be made deliberately rather than by weakening the gate.
- Full-domain generalization means the gate rarely refuses once there are at least k records; it generalizes hard instead. A cohort of five people at five different employers is released with employer suppressed and the start date widened to a decade. That is correct and the privacy report says so plainly, but a buyer can still pay for a dataset that generalization has emptied of value. LD-503 buyer evaluation surface has to show the achieved k and the generalization levels **before** purchase, not only after.
- `prepareRelease` is pure and deterministic. LD-502 governed access must call the same function rather than writing a second gate, or the two paths will drift and one of them will be the weaker.
- The epsilon budget exists and is enforced, but nothing spends it yet. LD-502 is where `spendEpsilon` gets wired to a real aggregate query, and it must persist `data_pools.epsilon_spent` rather than holding the budget in memory.
- `data_pools.k_anonymity_target` is clamped so `minimum_contributors` is never lower than it. Any later code that sets one must set the other, or the purchase check will pass a release the privacy gate then refuses.
- Adding a field to any schema in `lib/schemas/vault-schemas.ts` now requires a classification in the same change, the same way a new table requires a deletion-manifest entry.

Notes on LD-301 that affect later work.

- The next piece of work this needs is an operator console. Pause, resume, extend, and resolve are implemented and tested as service functions with no screen and no server action, because a person marking their own request fulfilled would make the evidence worthless. Until that console exists, an operator has to advance a case through the service role directly.
- `rights_case_events` is append-only in the database, not just by convention. A trigger rejects UPDATE, and DELETE is revoked from the API roles. The one delete that still works is the cascade from an erased account, which is deliberate: the right to erasure outranks our wish to keep evidence about someone.
- Deadlines are recomputed from `received_at`, `extended_to`, and `paused_ms` on every read rather than trusted from `due_at`, so a stored value cannot drift. Anything that writes those columns must keep them consistent.
- There is exactly one deletion path, `account.service.deleteAccount`. A `deletion` rights case tracks the request and its deadline; it does not delete anything itself, because erasure requires step-up re-authentication. The privacy page says so plainly rather than implying otherwise.

Notes on LD-602 that affect later work.

- Organization API request schemas now live in `lib/validations/org-api.ts` and are imported by the handlers. Adding a field to a handler means adding it to that schema, which changes the published specification in the same commit. That is the mechanism that keeps them honest, so do not reintroduce an inline schema in a route.
- `ORG_API_VERSION` and `WEBHOOK_API_VERSION` are separate on purpose. A webhook payload change breaks a recipient that we cannot redeploy, so it moves independently of the request API.
- The webhook payload allowlist is a runtime guard, not a convention. `assertNoPersonalData` runs before a payload is queued, and the forbidden-key list in `webhook.service.ts` is deliberately broad. Widening a payload means widening that list, which should feel deliberate.
- Delivery signing uses the stored secret hash rather than a plaintext secret, so a database read alone does not hand an attacker a working forgery key. LD-604 and anything else that adds an outbound callback should follow the same pattern.
- The SSRF guard checks hostnames, not resolved addresses. A hostname that resolves to a private address still gets through. Closing that needs DNS resolution at send time with a re-check after resolution, and it is worth doing before the webhook surface is opened to self-service.

| LD-503 buyer evaluation surface | Delivered 2026-07-26 | `lib/services/pool-evaluation.service.ts` shows a buyer what a purchase would actually deliver before they pay: contributor band, record count, per-field coverage, freshness buckets, and a privacy panel reporting the cohort size the release would achieve, how many records would be withheld, and how far each field would be generalized. It calls the same `prepareRelease` the purchase path calls, so a quote cannot disagree with a charge, and `computeOrderTotal` moved into `lib/constants/marketplace-economics.ts` for the same reason. Coverage, freshness, and schema mix come from three Postgres functions that aggregate keys and timestamps without ever returning a contributed value. Samples are invented from the schema by `lib/services/synthetic-samples.ts`, which a test proves cannot even import a repository. | Nothing in scope. Distribution-shape quality metrics were left out deliberately, because the useful ones are themselves disclosive on a small pool. |

| LD-604 bulk and asynchronous organization operations | Delivered 2026-07-26 | `bulk_jobs` and `bulk_job_rows` make the row the unit of work, so one malformed address fails on its own and can be retried without repeating the rest. `lib/services/bulk-job.service.ts` covers issuance, revocation, and consent requests, with a content-derived idempotency key that stops a resumed or double-swept job from issuing twice, cancellation checked between rows so nothing is half issued, and a `retryFailedRows` that touches only failures. Quota runs inside `issueCredential`, so the bulk path cannot spend more allowance than the single one. Jobs start through `after()` and the scheduler is the resume path. Completion and failure emit LD-602 webhooks. | Upload is a JSON paste rather than a file picker with CSV parsing. The row shape and the limits are the hard part and are done; a file reader on top is presentation. |

### 6.5 A defect found while building Phase 2

`supabase/migrations/20260726160000_api_role_grants.sql`.

Resetting a local database from the migrations produced an application that could not read its own tables: every request failed with `permission denied for table vault_data` for the `authenticated` role. The cause is that tables here are created by `postgres`, and the default privileges for `postgres` in the public schema grant only TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN to the API roles. The Supabase default that grants SELECT, INSERT, UPDATE, and DELETE belongs to `supabase_admin`, so it never applied to anything these migrations created.

Existing deployments work because they were provisioned before this, which is precisely why it went unnoticed: the schema was not reproducible from the migrations alone. Anyone bootstrapping the project from a clean database got a broken application, and the failure looked like an auth problem rather than a privilege one.

The migration grants the privileges explicitly, sets matching default privileges so the next migration does not reintroduce the gap, and re-applies every closure the blanket grant would otherwise have undone. Row level security remains the guardrail; table privileges only decide whether PostgREST can reach RLS at all.

Two things follow. Any migration that adds a table meant to be service-role only must add its own `REVOKE ALL ... FROM anon, authenticated`, because the default privileges now grant DML to new tables. And `npx supabase db reset --local` is worth running before a release, since it is the only thing that would have caught this.

A second, smaller instance of the same class turned up while building LD-503. `REVOKE EXECUTE ... FROM PUBLIC` on a new function removes the default grant from **every** role, `service_role` included, so a function meant to be service-role only needs an explicit `GRANT EXECUTE ... TO service_role` immediately afterwards. Without it the failure appears at runtime as a permission error rather than at deploy time. Treat revoke-then-grant as a single idiom.

### 6.6 What is left in Phase 2

Seven specs remain. This is the order to take them in and what each one now depends on, given what has already landed.

**1. LD-503 buyer evaluation surface.** Delivered 2026-07-26. Kept here because the reasoning still applies to anything that quotes a price or a volume: call `prepareRelease`, do not estimate.

**2. LD-604 bulk and asynchronous organization operations.** Delivered 2026-07-26. Worth noting for anything that follows: the row-level idempotency key and the `after()` start are the two things that make a long operation safe to resume, and both should be copied rather than reinvented.

**3. LD-201 connector framework.** The largest remaining piece and the one with the most prerequisites now.
- Adding `lib/crypto/ingestion-keys.ts`, or any other module under `lib/crypto/`, **will fail the build** until `lib/constants/trust-disclosures.ts` gains a matching `KEY_CUSTODY` entry.
- A `data_sources` table **will fail the build** until it has a `DELETION_MANIFEST` entry, and it must add its own `REVOKE` if it is service-role only.
- Any field a connector writes into a vault schema **will fail the build** until it is classified in `lib/privacy/quasi-identifiers.ts`. This is the constraint most likely to be discovered late, so classify as you map.
- Token refresh belongs in `JOB_NAMES` on the LD-601 runner, which is where the comment in `scheduled-jobs.service.ts` already says it goes.

**4. LD-202 source health and provenance.** Follows LD-201 directly and should reuse the same `data_sources` rows rather than adding a parallel notion of a source.

**5. LD-206 tracker transparency and browsing insight.** The remaining half of the "a new user gets something useful before contributing" criterion. It is worth checking whether the insight can be delivered without the extension first, because LD-205 is a separate build target.

**6. LD-205 extension foundation.** A browser extension is a new artifact with its own build, review, and release process, not another route in this application. Treat it as such when estimating.

**7. LD-108 accessibility conformance.** Deferrable, and the specification says so, but the e2e suite already asserts named landmarks, single page headings, and keyboard-dismissable menus, so the starting position is better than zero.

Two smaller pieces of unfinished work sit outside that list and should be picked up with whichever spec touches them next.

- **An operator console for rights cases.** `pause`, `resume`, `extend`, and `resolve` are implemented and tested with no screen and no server action behind them. Until that exists, an operator has to advance a case through the service role by hand, which does not scale past a handful of requests.
- **Webhook management for organizations.** `createWebhook` is a service function with no UI, so an endpoint can only be registered by an operator.

### Phase 3, months 6 to 9. Make credentials portable and access governed

- LD-401 standards-based credential formats
- LD-402 derived proofs
- LD-405 credential correction, supersession, and renewal
- LD-204 mobile application, stage A
- LD-304 portable import and transfer
- LD-506 marketplace integrity and fraud controls
- LD-606 abuse reporting and enforcement
- LD-605 platform integrity and insider controls
- LD-502 governed access, started

Exit criteria: a LucidData credential verifies in an external wallet, buyers can purchase a verified claim rather than a copy, and a credential can be held on a phone.

### Phase 4, months 9 to 12. Broaden and deepen

- LD-404 proximity credential presentation
- LD-204 mobile application, stage B health capture
- LD-104 account continuity for death and incapacity
- LD-502 governed access, completed
- LD-203 provider export adapters, with the LD-205 walkthroughs
- LD-207 opt-in browsing contribution
- LD-103 client-side search
- LD-403 delegation, subject to a threat model
- LD-504 offer targeting

Phase 4 is over-subscribed and will not fit in three months. It is listed in priority order rather than
as a commitment. If capacity is limited, LD-404 and LD-204 stage B are the two that matter, because
together they complete the in-person credential use case. LD-207 should slip rather than ship rushed,
since it is the highest-risk path in the product.

### Capacity reality

A dependency and capacity pass over all 40 specs found no circular dependencies, but it found that every
phase exceeds what two to three engineers can deliver in three months, phase 1 by roughly double before
the rebalance above. The phases are therefore priority-ordered queues, not commitments. Treat the exit
criteria as the definition of a phase, and let the dates move.

The longest dependency chain is only three steps, so the constraint is width rather than depth. That
means adding engineers helps, and that the highest-fan-out specs, LD-303, LD-601, LD-201, and LD-501,
should start as early as their dependencies allow.

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
5. Vertical wedge. Every surviving competitor narrowed. Employment, education, and identity credentials fit the existing organization tooling better than consumer fitness data. Choosing a wedge would sharpen Phase 2 and Phase 3.
6. Distribution model. DataSapien reaches consumers by embedding in brands' existing apps rather than asking them to adopt one. Decide whether LucidData stays a destination product, offers an embeddable path later, or accepts slower consumer growth funded by organization revenue. This shapes how much consumer acquisition work is worth funding.
7. Issuer onboarding vertical. LD-404 only answers "is this tradesperson insured" if an insurer or trade body issues that credential. Pick one vertical and secure a launch issuer before building the presentation flow, otherwise it ships with nothing authoritative to present. Trade licensing and professional indemnity are the closest fit to the existing issuer tooling.
8. Browsing data appetite. LD-207 is the highest-return and highest-risk item here. Decide whether LucidData wants to be in the browsing data market at all before LD-206 ships, because LD-206 builds the collection capability either way and the answer changes what is said to users at that point.
9. Platform fee level. LD-505 requires a number. A fee high enough to fund the service reduces what contributors earn, and contributor earnings are already modest: at current guidance a person in the financial category earns roughly 1.50 dollars per sale. Decide whether the marketplace is a revenue line or an acquisition feature funded by organization subscriptions, because that answer sets the fee and changes how the product should be described to users.
10. Verification pricing. Section 7.6 shows per-check fees are worth roughly twelve times more to an individual than pool sales, and the buyer compares them to a manual check rather than to a data feed. Decide the fee, the subject's share, and whether verification is metered separately from the organization subscription. This is the single highest-leverage pricing decision in the document and it should be settled before LD-404 is built, because it changes what that feature is for.

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
| Phase 2 implementation | In progress | LD-607, LD-501, LD-301, LD-107, LD-503, LD-604 delivered and LD-602 delivered in part, 2026-07-26. Both open defects closed, plus three found during the work |
| Legal review | **Not done** | Blocks open decisions 1 and 9, and parts of LD-107 |
| User and buyer interviews | **Not done** | LD-404 and LD-107 rest on unvalidated assumptions |
| Team pre-mortem | **Not done** | No strategic risk pass has been run |

### Defects found during validation

These were live defects in the codebase rather than missing features. Status updated 2026-07-26.

| Defect | Evidence | Owned by | Status |
|---|---|---|---|
| Organization registration is unauthenticated and returns a working API key | [app/api/org/register/route.ts](../app/api/org/register/route.ts) | LD-109 | **Fixed.** Registration requires a session and issues no key; keys come only after domain verification |
| `assertIssuanceQuota` is defined but never called, so plan limits are unenforced | [lib/services/billing.service.ts](../lib/services/billing.service.ts) | LD-109 | **Fixed.** Moved inside `issueCredential`, so the portal and API paths cannot diverge |
| Issued credentials survive account deletion with claims intact | `ON DELETE SET NULL` in [20260616000007_credentials.sql](../supabase/migrations/20260616000007_credentials.sql) | LD-607 | **Fixed** 2026-07-26. Credentials about the subject are deleted explicitly before the auth user, so verification fails closed |
| Order records survive account deletion with payload intact | `ON DELETE SET NULL` in [20260725150000_marketplace_transaction_integrity.sql](../supabase/migrations/20260725150000_marketplace_transaction_integrity.sql) | LD-607 | **Fixed** 2026-07-26. The payload is emptied and both source links cleared, leaving a counted placeholder with `redacted_at` set |
| Marketplace sales become loss-making above a computable pool size | Fixed access fee in [data-order.service.ts](../lib/services/data-order.service.ts) against percentage processing costs | LD-505 | **Fixed.** 25% fee plus a minimum order, asserted profitable across eight pool sizes and every category |
| `interests` and `other` categories have a zero access fee, so every sale loses money | [lib/constants/data-pricing.ts](../lib/constants/data-pricing.ts) | LD-505 | **Fixed.** Both repriced off zero |

Every defect found during validation is now fixed. The two GDPR Article 17 defects, where a deleted
account kept credential claims and contributed record payloads, were closed by LD-607 on 2026-07-26.
Deletion no longer relies on foreign key behaviour: what does not cascade is handled explicitly, the
result is verified rather than assumed, and the person receives a signed receipt.

### Before this spec is considered final

1. Legal review of the questions in open decisions 1 and 9, plus US state data broker registration, FCRA exposure if credentials inform hiring, and money transmission on payouts.
2. Interviews with prospective users and at least one institutional buyer, to test the LD-404 and LD-107 assumptions before funding them.
3. A team pre-mortem.

## 10. Source index

All sources checked 2026-07-25. Vendor claims are labelled as reported in the sections above.

Direct competitors: [Inrupt](https://www.inrupt.com/products/enterprise-wallet-infrastructure), [Inrupt wallet docs](https://docs.inrupt.com/wallet/introduction), [Solid](https://solidproject.org/about), [Meeco vault](https://www.meeco.me/vault), [Meeco security](https://www.meeco.me/security), [Mydex](https://mydex.org/), [digi.me](https://digi.me/), [Dataswyft](https://www.dataswyft.com/), [Cozy](https://en.cozy.io/), [Cozy security](https://docs.cozy.io/en/cozy-stack/security/), [Vana docs](https://docs.vana.org/), [Vana confidential compute](https://docs.vana.org/applications/confidential-compute), [Reklaim](https://reklaimyou.com/how-it-works), [Reklaim privacy policy](https://reklaimyou.com/privacy), [Gener8](https://gener8ads.com/), [CitizenMe](https://www.citizenme.com/), [DataSapien](https://datasapien.com/about/), [DataSapien platform](https://datasapien.com/).

Adjacent products: [Optery pricing](https://www.optery.com/pricing/), [Optery security](https://www.optery.com/optery-security/), [Incogni](https://incogni.com/), [DeleteMe plans](https://joindeleteme.com/privacy-protection-plans/), [Permission Slip](https://permissionslipcr.com/), [Plaid Link](https://plaid.com/docs/link/), [Terra docs](https://docs.tryterra.co/), [Terra pricing](https://tryterra.co/pricing), [Apple Health](https://support.apple.com/en-us/108779), [Health Connect](https://developer.android.com/health-and-fitness/health-connect), [SpruceID Verify](https://docs.verify.spruceid.com/getting-started/overview/), [Entra Verified ID](https://learn.microsoft.com/en-us/entra/verified-id/introduction-to-verifiable-credentials-architecture), [EUDI ARF](https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework), [Snowflake sharing](https://docs.snowflake.com/en/user-guide/data-sharing-intro), [AWS Data Exchange](https://docs.aws.amazon.com/data-exchange/latest/userguide/what-is.html), [Databricks Clean Rooms](https://docs.databricks.com/aws/en/clean-rooms/), [BigQuery sharing](https://cloud.google.com/bigquery/docs/analytics-hub-introduction).

Regulatory and standards: [EDPB access guidelines](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en), [EDPB portability](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-right-data-portability-under-regulation-2016679_en), [EDPB consent](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en), [CCPA](https://oag.ca.gov/privacy/ccpa), [GPC](https://oag.ca.gov/privacy/ccpa/gpc), [UK DUAA](https://www.gov.uk/guidance/data-use-and-access-act-2025-data-protection-and-privacy-changes), [Data Governance Act](https://digital-strategy.ec.europa.eu/en/policies/data-governance-act), [Data Act](https://digital-strategy.ec.europa.eu/en/policies/data-act), [EUDI regulation](https://digital-strategy.ec.europa.eu/en/policies/eudi-regulation), [VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/), [OpenID4VCI](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html), [OpenID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html), [RFC 9901 SD-JWT](https://www.rfc-editor.org/rfc/rfc9901.html), [CFPB 1033 reconsideration](https://www.consumerfinance.gov/rules-policy/rules-under-development/personal-financial-data-rights-reconsideration/), [FHIR R4](https://hl7.org/fhir/R4/http.html), [SMART App Launch](https://hl7.org/fhir/smart-app-launch/).
