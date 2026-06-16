# LucidData - GitHub Copilot Instructions

## Project Overview

**LucidData** is a privacy-first personal data bank MVP that lets users own, control, and share their data on their terms. It is built with Next.js 15 (App Router, React 19), Supabase (Postgres, Auth, Realtime), and client-side encryption using the Web Crypto API. The app emphasizes user data sovereignty, an immutable audit trail, and data portability through open formats.

**Core Philosophy:**
- Treat user data as property, not product
- Transparency through comprehensive audit logging
- Granular consent management with time-bound permissions
- End-to-end encryption with user-controlled keys (keys are derived in the browser; the server never sees plaintext or keys)
- Data portability via open formats (JSON-LD, verifiable credentials)

**Current State:** Active MVP. Vault, consent, consent requests, audit log, verifiable credentials, and passkey sign-in are implemented end to end through server actions backed by Supabase. There is no Prisma layer and no server-held master key.

---

## 📚 Documentation Map

This file is self-contained: the patterns below live in its own sections. The older `.github/copilot/` sub-docs were removed because they described the retired Prisma and server-side-encryption design.

### In this document
- **[Core Security Patterns](#core-security-patterns)** - Client-side encryption, audit hash chains, Supabase auth
- **[Server Action & Data-Access Patterns](#server-action--data-access-patterns)** - The action, service, and repository layering
- **[Database Schema](#database-schema)** - Tables and where the schema is defined
- **[Component Structure & Patterns](#component-structure--patterns)** - Server vs Client components, shadcn/ui, layouts
- **[Coding Conventions](#coding-conventions)** - Naming, imports, file organization

### Project docs
- **[README.md](README.md)** - Vision, roadmap, high-level architecture
- **[SETUP.md](SETUP.md)** - One-time configuration, service URLs, architecture
- **[QUICKSTART.md](QUICKSTART.md)** - Daily commands and troubleshooting

**How to use this map:**
1. Check Core Security Patterns for rules that apply to ALL features.
2. Read the relevant in-document section before implementing a feature.
3. Reference README, SETUP, and QUICKSTART for setup, commands, and conventions.

---

## Core Security Patterns

**These rules apply to ALL features. Failure to follow results in security vulnerabilities.**

### Encryption (client-side, Web Crypto API)
- **Encrypt vault data in the browser** before it reaches the server. Use `lib/crypto/client-crypto.ts` for AES-GCM and `lib/crypto/key-derivation.ts` for the PBKDF2 master key.
- **Use envelope encryption:** encrypt data with a per-entry DEK, wrap the DEK with the user's master key, and send only `client_ciphertext`, `encrypted_dek`, and `dek_salt`.
- **Never send plaintext, the master key, or the password to the server.** There is no server-side `ENCRYPTION_KEY` or `getMasterKey()`.
- **Validate the encrypted payload before persisting:** in the server action's Zod schema, require `client_ciphertext`, `encrypted_dek`, and `dek_salt` to be non-empty strings. Throw a validation error if any is absent; do not write a partial or plaintext row.
- **Server-held keys exist only for issuer signing:** issuer Ed25519 private keys are AES-256-GCM-wrapped with `ISSUER_KEY_SECRET` (see `lib/crypto/credential-signing.ts`).

### Audit Logging (Hash Chains)
- **Create audit log** for ALL vault/consent operations (create, read, update, delete, grant, revoke)
- **Include `previousHash`** to maintain immutable chain integrity
- **Use `lib/crypto/hashing.ts`** - `createAuditHash()` for hash generation
- **Never modify** existing audit log entries (immutable by design)

### Authentication (Supabase)
- **Resolve the user from the session** with `lib/supabase/server.ts` inside every server action and route handler; never accept a user id from the client.
- **Always check** `user` exists before proceeding (never assume authentication).
- **Filter all queries** by the authenticated `userId` in the repository layer.
- **Use the correct Supabase client:** `server.ts` in server code, `client.ts` in Client Components.

**Detailed code examples** live below under Common Patterns & Examples.

---

## User-Facing Copy

When generating or editing user-facing copy, apply the **humanizer** rules ([.github/skills/humanizer/SKILL.md](.github/skills/humanizer/SKILL.md)) directly as you write it. This covers README and docs, UI labels, button text, empty states, error and toast messages, onboarding copy, and email or notification text.

- Strip AI-writing tells as you generate copy: em dashes, emoji in headings, Title Case headings, promotional and rule-of-three phrasing, and filler words.
- Use plain, neutral, second-person voice that fits product and reference text; do not add personality or first-person language to UI strings.
- When copy describes a feature, confirm it matches the current implementation (Supabase plus client-side encryption), not the old Prisma or server-encryption model.

---

## Tech Stack

**For comprehensive stack overview, see [README.md](README.md). Critical versions and configuration notes below.**

### Core Framework
- **Next.js 15.1.3** with App Router (React 19) - Path alias: `@/*` maps to project root
- **TypeScript 5** with strict mode enabled
- **Tailwind CSS 3.4.1** for styling

### Database
- **Postgres via Supabase.** Schema is managed with SQL migrations in `supabase/migrations/`; there is no ORM.
- **Local stack:** `npx supabase start` (applies migrations). Types: `npx supabase gen types` into `types/database.types.ts`.
- **Data access** goes through `lib/repositories/` and `lib/services/`, never raw SQL in components.

### Authentication
- **Supabase Auth** (`@supabase/supabase-js`, `@supabase/ssr`) with cookie-based sessions.
- **Passkeys** via `@simplewebauthn/browser` and `@simplewebauthn/server` (WebAuthn).
- Use `@/lib/supabase/server` (await `createClient()`) in server actions, route handlers, and Server Components.
- Use `@/lib/supabase/client` in Client Components.

### UI & Components
- **shadcn/ui** with Radix UI primitives, **Lucide React 0.562.0** icons
- Use `cn()` utility for className merging (`clsx` + `tailwind-merge`)

### Forms & Validation
- **React Hook Form** with **Zod** (schemas in `lib/validations/`). All inputs MUST be validated.
- Use `.parse()` in server actions and services (throws), `.safeParse()` in forms (returns a result).

### Data Fetching
- **TanStack Query** for client-side fetching and cache invalidation; hooks live in `lib/hooks/` (`useVault`, `useConsent`, `useAudit`).

### Security
- **Client-side:** Web Crypto API for PBKDF2 key derivation and AES-GCM vault encryption (`lib/crypto/key-derivation.ts`, `lib/crypto/client-crypto.ts`).
- **Server-side:** Node `crypto` for SHA-256 audit hash chains (`lib/crypto/hashing.ts`) and AES-256-GCM wrapping of issuer keys plus Ed25519 credential signing (`lib/crypto/credential-signing.ts`, `lib/crypto/credential-verify.ts`).

---

## Database Schema

The schema lives in SQL migrations under `supabase/migrations/`, and the generated TypeScript types in `types/database.types.ts` (regenerate with `npx supabase gen types`). Treat those two as the source of truth; there is no Prisma schema.

Core tables (snake_case columns):
- `users` - synced with Supabase Auth. Holds `key_salt`, used to derive each user's master key in the browser.
- `vault_data` - encrypted entries. Stores `client_ciphertext`, `encrypted_dek`, and `dek_salt` (all produced in the browser) plus unencrypted metadata (`label`, `category`, `tags`, `schema_type`) for querying.
- `consents` - grants to a `granted_to` party with `permissions`, `status`, and a `start_date`/`end_date` window for time-bound access.
- `consent_requests` - access requests an organization sends to a user, which the user approves or denies.
- `audit_logs` - append-only events with `current_hash`/`previous_hash` forming a tamper-evident chain (see `lib/crypto/hashing.ts`).
- `passkeys` - WebAuthn credentials for passkey sign-in.
- `org_members`, `issuer_keys`, `credentials`, `credential_shares` - organization membership, Ed25519 issuer keys (private keys AES-256-GCM-wrapped with `ISSUER_KEY_SECRET`), issued verifiable credentials, and credential sharing.

**Hash chain:** Each `audit_logs` row's `current_hash` includes the previous row's hash, creating a tamper-evident trail. Verify it with `verifyHashChain()` from `lib/crypto/hashing.ts`, and never modify existing rows; the chain is immutable by design.

---

## Security & Encryption Requirements

The full rules, with the client-side envelope-encryption flow, are in [Core Security Patterns](#core-security-patterns) above.

---

## Server Action & Data-Access Patterns

Vault, consent, and credential mutations use **server actions** in `lib/actions/`, not REST route handlers. Each action authenticates via the Supabase session, then calls a service that uses a repository. Route handlers under `app/api/` are reserved for auth, org, and webhook-style endpoints.

Key rules: authenticate from the session, validate with Zod, scope every query by the authenticated `userId`, and append an audit-log entry for sensitive operations.

---

## Component Structure & Patterns

### Server vs Client Components
**Default to Server Components:**
```typescript
// app/(dashboard)/vault/page.tsx
// No 'use client' directive = Server Component
export default async function VaultPage() {
  // Can directly access database, auth, etc.
  return <div>Content</div>;
}
```

**Use Client Components only when needed:**
```typescript
'use client'; // Required for useState, useEffect, event handlers, etc.
import { useState } from 'react';

export function VaultForm() {
  const [data, setData] = useState('');
  // Interactive component
}
```

### shadcn/ui Component Pattern
```typescript
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
```

### Layout Pattern
```typescript
// app/(dashboard)/layout.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  return (
    <div>
      <nav>{/* Navigation */}</nav>
      <main>{children}</main>
    </div>
  );
}
```

**Rules:**
- Use Server Components by default
- Add `'use client'` only for interactivity (state, effects, event handlers)
- Use `cn()` utility for merging classNames
- Follow shadcn/ui patterns for new UI components
- Validate auth in layouts for protected routes

---

## Zod Validation Schemas

Use schemas from `lib/validations/`. Call `.parse()` in server actions and services (throws on invalid input) and `.safeParse()` in forms (returns a result).

---

## Development Workflow

**For daily development commands and troubleshooting, see [QUICKSTART.md](QUICKSTART.md).**

**For service URLs, environment setup, and initial configuration, see [SETUP.md](SETUP.md).**

### Quick Reference
- **Start dev server:** `npm run dev` (http://localhost:3000)
- **Local Supabase stack:** `npx supabase start` (applies migrations); Studio at http://127.0.0.1:54323
- **New migration:** add a SQL file under `supabase/migrations/`, then `npx supabase migration up --local`
- **Regenerate types:** `npx supabase gen types` into `types/database.types.ts`
- **Tests:** `npm test` (Vitest), `npm run test:e2e` (Playwright)

### Critical Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase client config
- `SUPABASE_SERVICE_ROLE_KEY` - server-only privileged access
- `ISSUER_KEY_SECRET` - base64 32-byte key that AES-256-GCM-wraps issuer private keys (needed only for credential issuance)
- `NEXT_PUBLIC_RP_ID` - WebAuthn relying-party id (`localhost` in dev)

**⚠️ CRITICAL:** There is no `ENCRYPTION_KEY`. Vault keys are derived in the browser from the user's password, so the server cannot decrypt vault data. Never commit `.env.local` to git.

---

## Coding Conventions

### Naming Conventions
- **Files**: kebab-case (`vault-data.ts`, `client-crypto.ts`)
- **Components**: PascalCase (`VaultPage`, `Button`, `AuditLogTable`)
- **Functions**: camelCase (`createClient`, `generateKey`, `verifyHashChain`)
- **Types/Interfaces**: PascalCase (`VaultDataInput`, `User`, `ConsentStatus`)
- **Constants**: UPPER_SNAKE_CASE (`ALGORITHM`, `KEY_LENGTH`, `IV_LENGTH`)
- **Database**: snake_case (`vault_data`, `audit_logs`, `created_at`)
- **API Routes**: kebab-case, RESTful (`/api/vault`, `/api/consent/[id]`)

### File Organization
```
app/
  (auth)/          # Sign-in, register, passkey, signup
  (dashboard)/     # Vault, consent, audit, credentials, requests, settings
  (org)/           # Organization and credential-issuer routes
  api/             # Auth, org, and webhook route handlers
components/        # ui/ (shadcn) plus feature folders (vault, consent, credentials, org)
lib/
  actions/         # Server actions ('use server')
  services/        # Business logic
  repositories/    # Supabase data access
  crypto/          # Client-side encryption, key derivation, hashing, credential signing
  supabase/        # Supabase server/client/middleware/service
  hooks/           # TanStack Query hooks
  validations/     # Zod schemas
supabase/
  migrations/      # SQL migrations (source of truth for schema)
types/             # TypeScript types (database.types.ts is generated)
```

### Import Order
```typescript
// 1. React/Next.js
import { useState } from 'react';
import { redirect } from 'next/navigation';

// 2. External libraries
import { z } from 'zod';
import { useForm } from 'react-hook-form';

// 3. Internal utilities (@ alias)
import { createClient } from '@/lib/supabase/server';
import { getUserVaultData } from '@/lib/services/vault.service';
import { encryptWithKey, decryptWithKey } from '@/lib/crypto/client-crypto';

// 4. Components (@ alias)
import { Button } from '@/components/ui/button';
import { VaultCard } from '@/components/vault/vault-card';

// 5. Types (@ alias)
import type { VaultDataInput } from '@/lib/validations/vault';
```

### TypeScript Rules
- Enable strict mode (already configured)
- Always type function parameters and return values
- Use `type` for object shapes, `interface` for extensible contracts
- Prefer `const` over `let`
- Use optional chaining (`?.`) and nullish coalescing (`??`)

---

## Common Patterns & Examples

### Layered architecture
Vault, consent, and credential operations flow through four layers. Do not touch the database directly from components or route handlers.

1. **Server action** (`lib/actions/*.actions.ts`, marked `'use server'`): authenticate the user from the Supabase session, then delegate to a service. Never trust a client-supplied user id.
2. **Service** (`lib/services/*.service.ts`): business logic, validation, and audit logging.
3. **Repository** (`lib/repositories/*.repository.ts`): Supabase reads and writes, scoped by `userId`.
4. **Supabase client** (`lib/supabase/server.ts` in server code, `lib/supabase/client.ts` in Client Components).

### Client-side envelope encryption
The browser does all vault encryption; the server only stores ciphertext.

1. Derive the master key from the user's password and their `key_salt` with `deriveMasterKey()` (PBKDF2, 600k iterations) from `lib/crypto/key-derivation.ts`.
2. Generate a per-entry data key (DEK) and encrypt the data with it using `lib/crypto/client-crypto.ts`.
3. Wrap the DEK with the master key. Send only `client_ciphertext`, `encrypted_dek`, and `dek_salt` to the server.

```typescript
// Authenticated server action (lib/actions/vault.actions.ts)
'use server'
import { createClient } from '@/lib/supabase/server'
import { createVaultData } from '@/lib/services/vault.service'
import { createVaultSchema } from '@/lib/validations/vault'

export async function createVaultEntryAction(input: unknown) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  // Validate all inputs with Zod before touching the service.
  // createVaultSchema requires client_ciphertext, encrypted_dek, and
  // dek_salt to be non-empty strings; .parse() throws on invalid input.
  const payload = createVaultSchema.parse(input)

  return createVaultData(user.id, payload) // service writes ciphertext + audit log
}
```

The service appends the audit-log entry with `createAuditHash()` from `lib/crypto/hashing.ts`, passing the previous entry's hash to keep the chain intact. Reads follow the same path: the action authenticates, the service/repository fetches rows scoped by `userId`, and decryption happens in the browser with the user's master key.

---

## Testing

- **Unit/component:** Vitest (`npm test`), with MSW mocks and fixtures under `test/`.
- **End-to-end:** Playwright (`npm run test:e2e`) with specs in `__tests__/e2e/`.
- Database changes are applied through Supabase migrations, not a Prisma seed.

---

## Documentation References

### Project Documentation
- **[README.md](README.md)** - Project vision, roadmap, comprehensive tech stack overview
- **[SETUP.md](SETUP.md)** - Initial setup, architecture notes, service URLs, troubleshooting
- **[QUICKSTART.md](QUICKSTART.md)** - Daily development workflow, commands, common tasks

### Copilot Instructions
- **[Documentation Map](#-documentation-map)** - Navigation to the sections of this document
- **[Core Security Patterns](#core-security-patterns)** - Critical rules for encryption, audit, and auth

### Code Reference
- **Schema** - [supabase/migrations/](supabase/migrations/) and generated [types/database.types.ts](types/database.types.ts)
- **Crypto** - [lib/crypto/key-derivation.ts](lib/crypto/key-derivation.ts), [lib/crypto/client-crypto.ts](lib/crypto/client-crypto.ts), [lib/crypto/hashing.ts](lib/crypto/hashing.ts), [lib/crypto/credential-signing.ts](lib/crypto/credential-signing.ts)
- **Actions / services / repositories** - [lib/actions/](lib/actions/), [lib/services/](lib/services/), [lib/repositories/](lib/repositories/)
- **Validations** - [lib/validations/](lib/validations/) for Zod schemas

---

## Important Architectural Notes

1. **Current MVP State**: Vault, consent, consent requests, audit log, verifiable credentials, and passkey sign-in work end to end on Supabase via server actions.

2. **Security-First**:
   - Encrypt vault data in the browser before it reaches the server
   - Always create audit logs for sensitive operations
   - Always resolve the user from the session before allowing access
   - Never expose plaintext, keys, or passwords in logs or errors

3. **Hash Chain Integrity**: Audit logs form an immutable chain. Any modification breaks the chain and is detectable via `verifyHashChain()`.

4. **User Data Ownership**: All queries must filter by the authenticated `userId`. Never allow users to access others' data.

5. **No ORM**: Data access is Supabase through `lib/repositories/`. The schema is owned by `supabase/migrations/`.

6. **Issuer Signing**: Organizations sign credentials with Ed25519 keys whose private halves are AES-256-GCM-wrapped at rest with `ISSUER_KEY_SECRET`.

---

## Quick Reference Checklist

When implementing new features:

- [ ] Validate all inputs with Zod schemas
- [ ] Resolve the user from the Supabase session in the server action (never trust a client id)
- [ ] Encrypt vault data in the browser; send only ciphertext and the wrapped DEK
- [ ] Create an audit log with hash chain for sensitive operations
- [ ] Filter every query by the authenticated `userId`
- [ ] Use Server Components by default, add `'use client'` only when needed
- [ ] Follow naming conventions (PascalCase components, camelCase functions, kebab-case files)
- [ ] Run the humanizer skill over any user-facing copy you add or change
- [ ] Use `cn()` utility for className merging in components

---

**Last Updated**: June 16, 2026
