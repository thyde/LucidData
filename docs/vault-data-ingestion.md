# Vault Data Ingestion — Design Plan

Status: draft for review. Nothing here is implemented yet. It plans how users get data
into their vault with less friction, how that data is stored and encrypted, and how it is
anonymized for the marketplace without breaking the zero-knowledge model.

## 1. Problem

Today the only way to add vault data is a manual form whose main field is a raw JSON
textarea. The user is expected to hand-format JSON, there is no file import, and there is
no way to pull data from the services where people's data already lives (banks, fitness
trackers, health apps, browsers, social accounts).

This hurts two things at once:

- Adoption. Most people will not hand-type structured records, so vaults stay near empty.
- The marketplace. Buyers pay for volume, recency, and breadth. With thin vaults there is
  little to pool and sell, so the data exchange is not attractive to buyers, which removes
  the earning incentive that draws users in. It is a cold-start loop.

Goal: make it easy to collect a large amount of accurate, well-structured, recent data
per user, while keeping the promise that the server cannot read vault contents and the
user stays in control of what is shared.

## 2. Principles

These constrain every option below.

- Zero-knowledge by default. The server must not be able to read vault plaintext at rest.
  Manual and file ingestion stay fully client-side (encrypt in the browser, upload
  ciphertext).
- Explicit, revocable consent. Nothing is shared or sold without a per-field opt-in, and
  the user can always see exactly what a buyer would receive.
- Provenance. Every entry records where it came from (manual, file, or a named provider)
  and when, so users and buyers can reason about freshness and trust.
- Structure over blobs. Move from free-form JSON to typed schemas so data is searchable,
  verifiable, priceable, and safely anonymizable.
- Progressive effort. Offer a ladder from "type one field" to "connect an account," so
  there is always a low-effort next step.

## 3. Current state

- Crypto: `lib/crypto/key-derivation.ts` derives a non-extractable master key with PBKDF2
  (600k iterations) from the password plus `users.key_salt`. `lib/crypto/client-crypto.ts`
  uses envelope encryption: a random per-entry DEK encrypts the data, the DEK is wrapped
  with the master key, and only `client_ciphertext`, `encrypted_dek`, and `dek_salt` reach
  the server.
- Vault row: `vault_data` stores those three ciphertext fields plus unencrypted metadata
  (`label`, `category`, `tags`, `schema_type`). `lib/validations/vault.ts` already carries
  `schemaType` and `schemaVersion`, but `data` is an untyped record entered as raw JSON.
- Marketplace: anonymization already runs in the browser at contribution time. The client
  decrypts approved fields, strips identifiers, and submits `pool_contributions.anonymized_payload`
  (server-readable on purpose). `vault_field_monetization` records per-field opt-in by
  `field_key` (keys only, never values). `data_pools.requested_fields` lists the fields a
  buyer wants. So the system already thinks in terms of named fields inside an entry.

The ingestion plan builds on these two facts: encryption is a client-side envelope, and
anonymization is a client-side projection the user approves.

## 4. Ingestion tiers

A ladder from least to most effort and infrastructure. Each tier reuses the same end
state: a typed, client-encrypted `vault_data` row with provenance.

### 4.1 Tier 0 — Structured manual entry (replaces raw JSON)

The fastest win and a prerequisite for everything else.

- Add a schema registry (section 5.6) that defines fields per `schema_type` (for example
  `identity`: legal name, date of birth, document number; `financial_summary`: income band,
  net worth band, currency; `medical_basic`: blood type, conditions, medications).
- Render a real form from the schema (typed inputs, units, enums, validation) instead of a
  JSON textarea. The JSON is assembled by the app, not the user.
- For `custom`, replace the raw textarea with a key/value field builder (add row, pick type:
  text, number, date, boolean, list). Raw JSON stays available as an "advanced" toggle for
  power users, with validation and pretty-printing.
- Output is the same encrypted entry; the difference is the user never sees JSON.

### 4.2 Tier 1 — File import (client-side parse and map)

- Supported inputs: CSV, JSON, and simple spreadsheets to start; PDF and images later via
  client-side extraction.
- Flow: choose file, parse in the browser, preview rows, map columns to schema fields
  (a mapping wizard), optionally split one file into many entries (for example one row per
  transaction), encrypt each entry in the browser, upload ciphertext.
- Parsing and mapping happen entirely client-side so plaintext never reaches the server.
- Ship a few templates for common exports (generic CSV, a bank-statement CSV shape) and let
  users save their own mappings for repeat imports.

### 4.3 Tier 2 — Provider exports (bulk files people already can download)

Many services let users download an archive. These are large structured files, parsed with
the Tier 1 pipeline plus provider-specific adapters.

- Google Takeout (location history, YouTube, search, contacts, calendar).
- Apple Health export (`export.xml` inside a zip; steps, heart rate, workouts, sleep).
- Browser history export (or a small extension that exports history and bookmarks).
- Social archives (Instagram/Meta export, X/Twitter archive, LinkedIn export, Spotify).

Each adapter maps the provider's shape to our schemas and runs client-side. This gives a
lot of data per user with no server-side access to a third party.

### 4.4 Tier 3 — Live connectors (OAuth and APIs)

The highest-value and highest-complexity tier. Connect an account once, then sync on a
schedule.

- Financial: Plaid (transactions, balances, identity).
- Fitness and health: Fitbit, Strava, Oura, Garmin, Whoop, Google Fit. Apple HealthKit
  needs a mobile app (Tier 4).
- Health records: FHIR endpoints and aggregators (for example 1up Health, Apple Health
  Records).
- Identity and social: Google (People, Calendar metadata), Microsoft Graph, Spotify.

Connectors create a hard tension with zero-knowledge: if the server performs the OAuth sync,
it briefly handles plaintext before encryption. Section 5.3 proposes how to keep that data
unreadable at rest. Where a provider supports browser-side calls, prefer doing the fetch in
the client so the server never sees it at all.

### 4.5 Tier 4 — Continuous capture (extension and mobile)

- Browser extension: streams browsing history, search, and time-on-site into the vault,
  encrypting locally before upload. This is the richest "browsing/interests" data and is
  hard to get any other way.
- Mobile app: the only route to Apple HealthKit and Google Fit background sync, plus
  device location and activity. Encrypt on device, upload ciphertext.

### 4.6 Tier 5 — Programmatic ingest API

A scoped, consent-gated API and webhook so power users or partners can push data in (for
example an employer pushing employment records the user accepts). Reuses the connector
encryption model in section 5.3.

## 5. Encryption and storage architecture

### 5.1 Today's model (keep for manual and file)

Client-side envelope encryption is already the right design for any data the browser holds:
derive master key, generate DEK, encrypt data with DEK, wrap DEK with master key, upload the
three ciphertext fields. Tiers 0 to 2 and the client halves of Tiers 4 and 5 use this
unchanged. The server stays zero-knowledge.

### 5.2 The connector problem

A server-side connector (Tier 3) logs into a third party as the user and pulls data. At that
moment the server holds plaintext. If we then encrypt it with the user's master key we cannot,
because the master key only exists in the user's browser (by design). So we need a way for the
server to write data the user can later read, without the server being able to read it back at
rest.

### 5.3 Proposed: a per-user asymmetric ingestion key

Add an asymmetric keypair per user, separate from the symmetric master key:

- Public key: stored in plaintext on the server (for example `users.ingest_public_key`).
- Private key: generated in the browser, then wrapped with the master key and stored as
  ciphertext (`users.wrapped_ingest_private_key`). Only the user's browser can unwrap it.

Connector ingestion (hybrid encryption, the standard sealed-box pattern):

1. The connector worker fetches data from the provider into memory.
2. It generates a random DEK, encrypts the normalized record with the DEK, and wraps the DEK
   to the user's public key (RSA-OAEP, or X25519 ECDH plus an ephemeral key).
3. It writes `client_ciphertext` plus the public-key-wrapped DEK and discards the plaintext.
   It never persists anything readable and holds no key that can decrypt at rest.
4. Later, the browser unwraps the DEK with the master-key-protected private key, reads the
   record, and (optionally) re-wraps the DEK to the symmetric master key so the entry matches
   the normal vault shape.

This keeps data unreadable at rest even for connector-sourced entries. It is honest about one
residual exposure: the worker sees plaintext transiently in memory during the fetch. That is a
weaker guarantee than the fully client-side tiers, so connectors are an explicit per-source
opt-in with that trade-off shown to the user. Stronger options (doing the fetch in the browser
or extension, or running the worker in a trusted execution environment) are noted as future
work.

Token storage: provider OAuth tokens are secrets. Store them encrypted with a server-held KMS
key (not the user's key, since the worker must use them headless), in a `data_source` row, with
strict RLS and service-role-only access. This is a deliberate, documented exception to
zero-knowledge that applies only to access tokens, never to vault contents.

### 5.4 Large objects and blobs

Files (PDFs, health export zips, images) do not belong inline in a row.

- Encrypt the file client-side with a per-file DEK, upload the ciphertext to Supabase Storage,
  and store the wrapped DEK plus metadata in a `vault_blob` row linked to the entry.
- Chunk large files so big health or Takeout archives stream rather than load whole.
- Storage buckets are private; objects are ciphertext, so a leaked object is useless without
  the user's key.

### 5.5 Queryable metadata and blind indexing

The marketplace needs to match vaults to buyer requests without reading values.

- Keep a small, deliberately non-sensitive metadata set unencrypted: `schema_type`, `category`,
  `tags`, units, coarse timestamps, source. This already exists and is enough for most pool
  matching ("users with fitness data from the last 30 days").
- For exact-match needs on a sensitive field, consider a blind index (HMAC of the normalized
  value with a per-user key) rather than storing the value. Treat this cautiously: blind indexes
  enable equality joins and therefore some linkage, so add them only per field with a clear
  reason, and never for free-text.

### 5.6 Schema registry and versioning

A typed registry is the backbone of structured entry, mapping, anonymization, and pricing.

- Define each `schema_type` as a list of fields with: key, label, data type, unit, enum
  options, sensitivity level, and an anonymization rule (section 7.2).
- Version schemas (`schema_version` already exists) so old entries stay valid as schemas evolve;
  store the version on the row and migrate forward lazily.
- The registry drives the entry form, the file-mapping targets, the fields a pool can request,
  and how each field is generalized before sale.

## 6. Data model additions

Sketch, not final. Every new table enables RLS with `auth.uid()`-scoped policies.

- `data_sources`: connected accounts. `user_id`, `provider`, `status`, `scopes`,
  `encrypted_tokens` (KMS-wrapped), `last_synced_at`, `cursor`.
- `import_jobs`: file and connector runs. `user_id`, `source`, `status`, `counts`, `error`,
  timestamps. Drives progress UI and retries.
- `vault_blobs`: encrypted file objects. `vault_data_id`, `user_id`, `storage_path`,
  `wrapped_dek`, `content_type`, `size`, `checksum`.
- `vault_data` new columns: `source` (manual/file/provider), `source_id`, `ingested_at`,
  `content_kind`. Provenance for trust and freshness.
- `users` new columns: `ingest_public_key`, `wrapped_ingest_private_key` (section 5.3).
- `schema_definitions` (optional, or ship in code first): the registry if we want it editable
  without a deploy.

## 7. Anonymization and de-anonymization

The user asked specifically about this. Two different things share similar names, so to be
precise:

- Anonymization: the process that protects identity before pooled data is sold.
- De-anonymization (re-identification): the attack we defend against, where someone links
  "anonymous" records back to a person.
- Consented re-identification: a separate, legitimate product capability where a buyer pays
  for data tied to a verified identity because the user explicitly agreed. This rides the
  existing consent and verifiable-credential rails, not the anonymous pool path.

### 7.1 Where anonymization runs

Client-side, at contribution time, as it does today. The browser decrypts only the approved
fields, applies the schema's anonymization rules, and submits the resulting
`anonymized_payload`. The server never sees the full entry, only the projection the user
approved. This is the correct boundary and we keep it.

### 7.2 Anonymization techniques

Driven by the per-field sensitivity and rule in the schema registry.

- Identifier stripping: drop direct identifiers (name, email, phone, exact address, account
  numbers, government IDs) unless the pool is a consented-identified pool.
- Generalization: bucket quasi-identifiers. Exact age to an age band, ZIP to a region, exact
  timestamp to a week or month, exact salary to a band. Generalization is what makes records
  non-unique.
- k-anonymity and friends: before a pool can be sold, enforce that each combination of
  quasi-identifiers appears at least k times (k-anonymity), with l-diversity on sensitive
  attributes where it matters. Enforce a minimum pool size so a "pool of one" can never ship.
- Differential privacy for aggregates: if buyers query summary statistics rather than rows,
  add calibrated noise and track a per-contributor privacy budget.
- Coarse-by-default: pricing and UI should nudge toward generalized data, with finer grids
  priced higher and gated behind stronger consent.

### 7.3 De-anonymization threats and mitigations

- Linkage across pools: the same user contributing to several pools can be re-identified by
  joining them. Mitigate with per-pool pseudonyms (no stable cross-pool user token in payloads),
  generalization, and minimum k within each pool.
- Uniqueness and outliers: rare values (a very high income, a rare condition) are identifying.
  Mitigate with top and bottom coding, suppression of rare categories, and outlier review
  before a pool ships.
- Re-identification by a buyer combining with outside data: mitigate with data-use agreements,
  query and export auditing, and rate limits on row-level export below a k threshold.
- Leak tracing: seed pools with a small number of canary records unique per buyer so a leaked
  dataset can be traced to its purchaser.
- Withdrawal: when a user withdraws a contribution, stop including it in future snapshots and
  record the boundary in the audit log.

### 7.4 Consent and transparency

- Per-field opt-in already exists (`vault_field_monetization`). Extend the UI to show a live
  preview of exactly the anonymized record a buyer would receive for a given pool, before the
  user opts in.
- Respect `sale_preferences` (allowed purposes, blocked buyers, minimum price) at contribution
  and at pool-build time.
- Write an audit entry for every contribution, withdrawal, and sale so the user has a complete,
  tamper-evident history.

## 8. UX flows

- "Add data" hub: one entry point with three doors. Type it in (schema forms), Upload a file
  (mapping wizard), Connect an account (OAuth). Each door ends in the same encrypted entry.
- Schema forms: typed fields, inline validation, units and enums, no JSON in sight. Custom uses
  a key/value builder.
- Import wizard: upload, preview, map, confirm, encrypt, save, with a progress and error
  summary from `import_jobs`.
- Connect-account: provider picker, OAuth, scope review, sync status, and a clear note that
  connector sync briefly processes data server-side before encryption (the section 5.3
  trade-off). Source management lists connected accounts with last-synced and disconnect.
- Motivation: tie completeness and recency to the existing data score and to an estimated
  marketplace value, so adding more data has a visible payoff. This directly attacks the
  cold-start problem.

## 9. Phased roadmap

Each phase is shippable on its own and ordered by value over effort.

1. Phase 1 — Structured entry. Schema registry (in code), schema-driven forms, custom
   key/value builder, validation. No new infrastructure, immediate friction drop. (Also fixes
   the "user must format JSON" complaint directly.)
2. Phase 2 — File import. Client-side CSV and JSON parsing, mapping wizard, `import_jobs`,
   `vault_blobs` plus Supabase Storage for encrypted files, a couple of templates.
3. Phase 3 — Provider exports. Adapters for Google Takeout, Apple Health export, and browser
   history, on the Phase 2 pipeline.
4. Phase 4 — Connectors. Asymmetric ingestion key (section 5.3), `data_sources`, one financial
   (Plaid) and one fitness (Fitbit or Strava) connector, background sync, source management.
5. Phase 5 — Continuous capture. Browser extension first (browsing and interests), then a mobile
   app for HealthKit and background location.
6. Cross-cutting — Anonymization hardening. k-anonymity and minimum pool-size enforcement,
   generalization rules in the registry, optional differential privacy for aggregate queries,
   canary records, export auditing.

## 10. Security and privacy guardrails

- Manual, file, and export tiers stay fully client-side; the server only ever stores ciphertext
  for vault contents.
- Connectors are an explicit per-source opt-in with the transient-plaintext trade-off shown.
  Vault contents are still unreadable at rest via the asymmetric ingestion key. Only OAuth
  tokens are server-readable, KMS-wrapped, service-role only.
- New tables enable RLS with `auth.uid()`-scoped policies and are queried scoped by the
  authenticated user in the repository layer.
- Keep unencrypted metadata minimal and non-sensitive. Add blind indexes only per field with a
  stated reason.
- Anonymization runs in the browser on user-approved fields. Pools cannot ship below k or below
  a minimum size. Every import, contribution, withdrawal, and sale is audit-logged.
- Imports validate and size-limit at the boundary; parsers run on untrusted file content, so
  treat them defensively (no eval, guard against zip bombs and huge rows).

## 11. Open questions

- How far do we go on zero-knowledge for connectors? Accept transient server-side plaintext with
  the asymmetric-key write-only model (proposed), push fetches to the browser or extension where
  possible, or invest in a trusted execution environment later?
- Do we add the asymmetric ingestion keypair to every user now (so connectors are possible
  later) or only when a user first connects a source?
- Build the schema registry in code first (fast) or as data in `schema_definitions` (editable
  without deploy)?
- Mobile app timing, since it gates the most valuable health and location data.
- Marketplace policy: minimum k, minimum pool size, and whether to support consented-identified
  pools as a distinct, higher-priced product.
