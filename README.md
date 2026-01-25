# 🧠 Lucid — Personal Data Bank

**Version:** 0.1 (MVP Phase)
**Author:** Terron Hyde
**License:** MIT (open-source)
**Status:** In Development

---

## 🌐 Overview

**Lucid** is a privacy-first **personal data bank** — a secure vault where individuals can store, manage, and license access to their personal data under explicit consent.

Lucid treats data as **property**, not a **product**.

> Individuals can securely store and license access to their digital data — without ever surrendering ownership.

### Core Philosophy

- **User Sovereignty**: Users remain the sole custodians of their data
- **Transparency by Default**: Every access and transaction is recorded and auditable
- **Portability through Open Standards**: Data conforms to universal formats for interoperability

---

## 🎯 Project Vision

### The Problem
The global digital economy runs on personal data — yet individuals who generate it have neither control nor compensation. Current data practices are opaque and exploitative.

### The Solution
Lucid enables a fundamental shift: transforming personal data from a harvested resource into a **governed, portable, and monetizable asset class** under full user control.

### Target Ecosystem

**Data Owners (Individuals)**
- Privacy advocates seeking transparency
- Professionals needing verifiable credential storage
- Anyone wanting control over their digital identity

**Data Consumers (Organizations)**
- Research institutions requiring consented participant data
- Healthcare providers needing compliant medical records
- Financial institutions demanding verified data
- Employers validating credentials

---

##  MVP Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Encrypted Personal Data Vault** | Secure storage with AES-256 encryption, user-controlled keys | ✅ MVP |
| **Consent-Based Access Control** | Granular permissions defining who can access what data, for how long | ✅ MVP |
| **Immutable Audit Ledger** | Hash-chained transparency log of all data access events | ✅ MVP |
| **Data Portability** | Export to open standards (JSON-LD, Verifiable Credentials) | ✅ MVP |
| **Intuitive User Experience** | Banking metaphor: "Your data. Your bank. Your rules." | ✅ MVP |

## Features in active development


## Deferred to Beta

| Feature | Description | Target Phase |
|---------|-------------|--------------|
| **Payment Integration** | Stripe Connect for monetization and revenue tracking | Beta |
| **Multiple Data Schemas** | FHIR (healthcare), Open Banking APIs (financial data) | Beta |
| **Advanced Verifiable Credentials** | Full W3C VC implementation with DID support | Beta |
| **Mobile Applications** | Native iOS/Android apps for on-the-go access | Post-Beta |
| **Buyer Marketplace** | Public marketplace for data consumers to discover and request access | Post-Beta |


---

## ⚙️ Local Setup

### Prerequisites
- Node.js 20+ LTS
- npm or pnpm
- Git
- VSCode (recommended)

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/terronhyde/lucid-mvp.git
cd lucid-mvp

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Initialize database
npx prisma migrate dev

# 5. Start development server
npm run dev

# 6. Run tests
npm test
```

---

## 🏗️ Project Structure

```
lucid-mvp/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes
│   ├── (dashboard)/       # Protected dashboard routes
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── vault/            # Vault-specific components (CRUD dialogs, list view)
│   └── consent/          # Consent management (5 dialogs with comprehensive tests)
├── lib/                   # Utilities & configurations
│   ├── db/               # Database utilities
│   ├── crypto/           # Encryption utilities
│   ├── hooks/            # Custom React hooks (useVault, useConsent, useAudit)
│   ├── repositories/     # Data access layer
│   ├── services/         # Business logic layer
│   └── validations/      # Zod schemas
├── test/                  # Test utilities and fixtures
│   ├── fixtures/         # Mock data factories
│   ├── helpers/          # Test helpers
│   └── utils/            # Test utilities
│   ├── auth/             # Authentication helpers
│   └── supabase/         # Supabase client
├── prisma/               # Database schema & migrations
├── public/               # Static assets
└── types/                # TypeScript type definitions
```


## 🔗 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Web Application** | http://localhost:3000 | Main Next.js app |
| **Supabase Studio** | http://127.0.0.1:54323 | Database admin & Auth management |
| **Supabase API** | http://127.0.0.1:54321 | REST API & Auth endpoints |
| **Mailpit** | http://127.0.0.1:54324 | Email testing (view sent emails) |
| **Database** | postgresql://postgres:postgres@127.0.0.1:54322/postgres | PostgreSQL connection |




