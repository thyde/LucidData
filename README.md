# Lucid

Personal data bank for storing, encrypting, and licensing access to your own data.

**Version:** 0.1 (MVP)
**Author:** Terron Hyde
**License:** MIT
**Status:** In development

---

## Overview

Lucid is a personal data bank. Individuals keep their data in an encrypted vault, then grant or deny specific organizations access to it under explicit, time-bound consent. The data stays the user's property; access is licensed rather than sold outright.

Encryption happens in the browser, so the server never sees plaintext data or the keys that protect it.

### Core philosophy

- **User sovereignty**: the individual holds the keys and decides who sees what.
- **Transparency**: every access and consent change is written to an append-only audit log.
- **Portability**: data and credentials use open formats so they can move between systems.

---

## Project vision

### The problem
The digital economy runs on personal data, but the people who generate that data usually have little say over how it is used and receive nothing when it is sold.

### The approach
Lucid gives the individual a vault they control and a consent system that decides who can use their data, for what, and for how long. Access can be priced and licensed over time instead of handed over permanently.

### Who it is for

Individuals who hold data:
- People who want to see and control how their data is used.
- Professionals who need to store and present verifiable credentials.

Organizations that request data:
- Research institutions that need consented participant data.
- Healthcare providers that need compliant records.
- Financial institutions that need verified data.
- Employers that need to validate credentials.

---

## MVP features

| Feature | Description | Status |
|---------|-------------|--------|
| Encrypted data vault | Client-side encryption with the Web Crypto API. Keys are derived from the user's password with PBKDF2, and data is sealed with AES-GCM in the browser. | Built |
| Consent-based access control | Granular, time-bound permissions that set who can access which data and for how long. | Built |
| Consent requests | Organizations request access to a user's data, and the user approves or denies each request. | Built |
| Immutable audit ledger | Hash-chained log of vault and consent events that can be checked for tampering. | Built |
| Verifiable credentials | Organizations issue Ed25519-signed credentials. Users hold them in an inbox, verify them, and share them. | Built |
| Passkey sign-in | WebAuthn passkeys alongside password sign-in. | Built |
| Installable PWA | Progressive web app with realtime updates over Supabase. | Built |

## In progress

| Feature | Description |
|---------|-------------|
| Vault data export | Exporting vault entries to open formats such as JSON-LD. Credentials are already portable, but a general vault export is not finished yet. |

## Deferred to beta and later

| Feature | Description | Target |
|---------|-------------|--------|
| Payment integration | Stripe Connect for licensing payments and revenue tracking. | Beta |
| Additional data schemas | FHIR for healthcare and Open Banking for financial data. | Beta |
| DID support | Decentralized identifiers for credential issuers and holders. | Beta |
| Mobile apps | Native iOS and Android clients. | Post-beta |
| Buyer marketplace | A place for organizations to discover and request data access. | Post-beta |


---

## Local setup

### Prerequisites
- Node.js 20+ LTS
- npm
- Git
- Docker Desktop (the local Supabase stack runs in containers)
- VS Code (recommended)

### Getting started

```bash
# 1. Clone the repository
git clone https://github.com/terronhyde/lucid-mvp.git
cd lucid-mvp

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase keys and ISSUER_KEY_SECRET

# 4. Start the local Supabase stack (this applies the SQL migrations)
npx supabase start

# 5. Start the development server
npm run dev

# 6. Run the tests
npm test          # unit and component tests (Vitest)
npm run test:e2e  # end-to-end tests (Playwright)
```

---

## Project structure

```
lucid-mvp/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Sign-in, register, passkey, and signup routes
│   ├── (dashboard)/       # Vault, consent, audit, credentials, requests, settings
│   ├── (org)/             # Organization and credential-issuer routes
│   └── api/               # Route handlers (auth, org, supabase, user)
├── components/            # React components
│   ├── ui/               # shadcn/ui primitives
│   ├── vault/            # Vault dialogs, list view, schema form
│   ├── consent/          # Consent dialogs and list
│   ├── consent-requests/ # Organization access-request UI
│   ├── credentials/      # Credential inbox
│   └── org/              # Issuer setup and credential issuance
├── lib/                   # Application logic
│   ├── actions/          # Server actions (vault, consent, audit, credential, issuer)
│   ├── crypto/           # Client-side encryption, key derivation, credential signing
│   ├── repositories/     # Data access layer over Supabase
│   ├── services/         # Business logic
│   ├── hooks/            # React hooks (useVault, useConsent, useAudit)
│   ├── supabase/         # Supabase server and browser clients
│   └── validations/      # Zod schemas
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




