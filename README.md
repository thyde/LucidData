# LucidData

An encrypted vault for your health and personal records, shared only on your terms.

**Version:** 0.1 (MVP)
**Author:** Terron Hyde
**License:** MIT
**Status:** In development

---

## Overview

LucidData keeps a person's health history and personal records in one encrypted vault. People bring in an Apple Health export, add records by hand, and hold credentials that organizations issue to them. They can share a credential through a link that shows only the fields they pick, and they answer organizations' access requests under explicit, time-bound consent.

Encryption happens in the browser, so the server never sees the contents of an entry or the keys that protect it. Labels, dates, and a few other fields stay readable so the vault can list entries; the trust centre names every one.

## Technology

- Next.js 16.3.8 with the App Router and React 19.2.7.
- Supabase for Postgres, Auth, Realtime, and Row Level Security.
- Serwist 9.5.6 for the installable PWA and offline cache.
- TypeScript 5, Tailwind CSS, shadcn/ui, TanStack Query, Vitest, and Playwright.

The development and production build scripts use Webpack explicitly because the stable Serwist 9 integration is Webpack-based. Keep the `--webpack` flags until Serwist supports the default Next.js bundler in a stable release.

### Core philosophy

- The individual holds the keys and decides who sees what.
- Every access and consent change is written to an append-only audit log.
- Data and credentials use open formats so they can move between systems.

---

## Project vision

### The problem
Health data is scattered across apps and devices, each with its own account and its own terms. The people it describes rarely hold a complete copy, and they have little say over where it goes.

### The approach
LucidData gives the individual one vault they control, encrypted before anything leaves their device, and a consent system that records who may use which data, for what, and until when. Health data is never sold.

### Who it is for

Individuals:
- People who want their health history in one place that only they can open.
- Professionals who need to store and present verifiable credentials.

Organizations:
- Issuers such as universities and employers that sign credentials.
- Verifiers that check the credentials people choose to share.
- Researchers and other buyers of de-identified credential data, under the purpose and retention each contributor approved.

---

## MVP features

| Feature | Description | Status |
|---------|-------------|--------|
| Encrypted data vault | Client-side encryption with the Web Crypto API. Keys are derived from the user's password with PBKDF2, and data is sealed with AES-GCM in the browser. | Built |
| Health imports | Apple Health, Strava, and Garmin exports imported in the browser as they download, zip and all, with health data stored only after separate, withdrawable consent. | Built |
| Health timeline | Daily charts of steps, sleep, heart rate, workouts, weight, and more, worked out in the browser from the decrypted vault. Each value names its source, and a day several sources recorded is counted once. | Built |
| Consent-based access control | Granular, time-bound permissions that set who can access which data and for how long. | Built |
| Consent requests | Organizations request access to a user's data, and the user approves or denies each request. | Built |
| Immutable audit ledger | Hash-chained log of vault and consent events that can be checked for tampering. | Built |
| Verifiable credentials | Organizations issue Ed25519-signed credentials. Users hold them in an inbox, verify them, and share them. | Built |
| Passkey sign-in | WebAuthn passkeys alongside password sign-in. A passkey that supports the PRF extension can also open the vault, at sign-in and after a reload, without the password. | Built |
| Installable PWA | Progressive web app with realtime updates over Supabase. | Built |
| Two-factor authentication | TOTP authenticator-app second factor, enforced at sign-in, with one-time backup codes for recovery. | Built |
| Data marketplace | Individuals can contribute de-identified credential data to buyer-defined pools for a small payment. Health, financial, location, and browsing data are never for sale. | Built |
| Payments and payouts | Stripe Checkout for organization subscriptions and dataset purchases, and Stripe Connect payouts to contributors. | Built |
| Vault data export | Export vault entries to open formats (JSON-LD). Entries are decrypted in the browser before download. | Built |
| Account recovery and notifications | Recovery-code vault escrow, password change with re-encryption, and realtime in-app notifications with optional email. | Built |
| Client API | A versioned HTTP API at `/api/v1` for the phone app and the browser extension. Calls carry the person's Supabase access token, so the database's row level security decides what each one can reach. The OpenAPI document is at `/api/v1/openapi`. | Built |

## Roadmap

[docs/competitive-feature-roadmap.md](docs/competitive-feature-roadmap.md) is the single definitive roadmap. It holds the prioritized list of features to build and gaps to close, with numbered specs, scoring, and a phased sequence. Planned work is tracked there, not in this file. The table above records what is built today.

Production rollout is an operational task rather than a feature. Hosted database migrations are current, and leaked-password protection requires Supabase Pro.


---

## Local setup

### Prerequisites
- Node.js 22+ LTS
- npm
- Git
- Docker Desktop (the local Supabase stack runs in containers)
- VS Code (recommended)

### Getting started

```bash
# 1. Clone the repository
git clone https://github.com/thyde/LucidData.git
cd LucidData

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase keys and ISSUER_KEY_SECRET

# 4. Start the local Supabase stack (this applies the SQL migrations)
npx supabase start

# 5. Start the development server
npm run dev

# 6. Run the local checks
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run test:e2e
```

`npm run security:audit` checks production dependencies. As of July 25, 2026, npm still reports high-severity advisories in Next.js and Serwist's transitive build dependencies, but offers only preview releases as fixes. Do not use `npm audit fix --force`; review the next stable Next.js and Serwist releases instead.

Server-side administrative flows prefer `SUPABASE_SECRET_KEY`. Existing projects can use
`SUPABASE_SERVICE_ROLE_KEY` as a legacy fallback, but current Supabase Auth admin APIs require the
new secret key format.

---

## Project structure

```
LucidData/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Sign-in, register, passkey, and signup routes
│   ├── (dashboard)/       # Vault, consent, audit, credentials, requests, settings
│   ├── (org)/             # Organization and credential-issuer routes
│   ├── api/               # Route handlers (auth, org, connectors, cron, stripe, user, and the v1 client API)
│   └── sw.ts              # Serwist service-worker source
├── components/            # React components
│   ├── ui/               # shadcn/ui primitives
│   ├── vault/            # Vault dialogs, list view, schema form
│   ├── consent/          # Consent dialogs and list
│   ├── consent-requests/ # Organization access-request UI
│   ├── credentials/      # Credential inbox
│   └── org/              # Issuer setup and credential issuance
├── lib/                   # Application logic
│   ├── actions/          # Server actions (vault, consent, audit, credential, issuer)
│   ├── crypto/           # Server crypto: audit hashing, credential and receipt signing
│   ├── repositories/     # Data access layer over Supabase
│   ├── services/         # Business logic
│   ├── hooks/            # React hooks (useVault, useConsent, useAudit)
│   └── supabase/         # Supabase server and browser clients
├── packages/core/         # @luciddata/core: vault encryption, schemas, Zod validation, import adapters
├── supabase/              # Local config and SQL migrations
├── test/                  # Unit and component test setup, fixtures, and mocks
├── __tests__/e2e/         # Playwright end-to-end tests
├── public/                # Static assets and PWA manifest
└── types/                # TypeScript type definitions
```


## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Web Application** | http://localhost:3000 | Main Next.js app |
| **Supabase Studio** | http://127.0.0.1:54323 | Database admin & Auth management |
| **Supabase API** | http://127.0.0.1:54321 | REST API & Auth endpoints |
| **Mailpit** | http://127.0.0.1:54324 | Email testing (view sent emails) |
| **Database** | postgresql://postgres:postgres@127.0.0.1:54322/postgres | PostgreSQL connection |




