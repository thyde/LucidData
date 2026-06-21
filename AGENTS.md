# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before making changes. For the full reference, see [.github/copilot-instructions.md](.github/copilot-instructions.md). The crypto layer has its own nested guidance in [lib/crypto/AGENTS.md](lib/crypto/AGENTS.md); read it before touching anything under `lib/crypto/`.

## What this project is

LucidData is a privacy-first personal data bank. Users own, control, and share their data on their terms. The app is built with Next.js 15 (App Router, React 19), Supabase (Postgres, Auth, Realtime), and client-side encryption using the Web Crypto API.

Core ideas:

- Treat user data as property, not product.
- Encrypt vault data in the browser. The server never sees plaintext, the master key, or the password.
- Keep an immutable, tamper-evident audit trail via SHA-256 hash chains.
- Grant access with granular, time-bound consent.

## Setup and commands

Requirements: Node, npm, and the Supabase CLI (installed as a dev dependency).

```bash
npm install            # install dependencies
npx supabase start     # start local Postgres/Auth/Studio and apply migrations
npm run dev            # start the app at http://localhost:3000
```

Common scripts (see package.json for the full list):

- `npm run dev` - start the dev server (binds 0.0.0.0).
- `npm run build` - production build.
- `npm run lint` - ESLint via next lint.
- `npm test` - Vitest in watch mode. `npm run test:run` for a single run.
- `npm run test:e2e` - Playwright end-to-end tests.
- `npm run test:all` - unit tests then e2e.

Database and migrations:

- Migrations are the source of truth, in `supabase/migrations/`. Add a new SQL file and run `npx supabase migration up --local`.
- Migrations are forward-only. Never edit a migration that has already been applied or deployed; write a new one. Name files `YYYYMMDDHHMMSS_short_description.sql` to keep ordering.
- Every new table MUST `ENABLE ROW LEVEL SECURITY` and ship user-scoped policies in the same migration (see RLS below). A table without RLS is exposed through the public PostgREST API with the anon key.
- Regenerate types with `npx supabase gen types` into `types/database.types.ts` after any schema change.
- There is no ORM. Do not add Prisma.

Environment variables (never commit `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase client config.
- `SUPABASE_SERVICE_ROLE_KEY` - server-only privileged access.
- `ISSUER_KEY_SECRET` - base64 32-byte key that AES-256-GCM-wraps issuer private keys (credential issuance only).
- `NEXT_PUBLIC_RP_ID` - WebAuthn relying-party id (`localhost` in dev).

There is no `ENCRYPTION_KEY`. Vault keys are derived in the browser from the user's password, so the server cannot decrypt vault data.

## Architecture

Mutations flow through four layers. Never touch the database directly from components or route handlers.

1. Server action in `lib/actions/` (`'use server'`). Resolve the user with a local `getAuthenticatedUserId()` helper that calls `supabase.auth.getUser()` and throws on no session, validate input against the matching schema in `lib/validations/`, then call a service. Never trust a client-supplied user id.
2. Service in `lib/services/`. Business logic, validation, and audit logging.
3. Repository in `lib/repositories/`. Supabase reads and writes, always scoped by `userId`.
4. Supabase client. Use `lib/supabase/server.ts` in server code and `lib/supabase/client.ts` in Client Components. `lib/supabase/service.ts` is the service-role client; see the RLS warning before using it.

Mutations use server actions, not REST handlers. Route handlers under `app/api/` are reserved for auth, org, and webhook-style endpoints. The action surface is broad (17 domains): vault, consent, consent-request, credential, credential-request, issuer, share, audit, account, notification, billing, monetization, marketplace, offer, data-order, contribution, and insights. New features follow the same four-layer flow.

Directory layout:

```
app/
  (auth)/        sign-in, register, passkey, signup
  (dashboard)/   vault, consent, audit, credentials, requests, settings
  (marketing)/   public marketing pages
  (org)/         organization and credential-issuer routes
  api/           auth, org, and webhook route handlers
components/      ui/ (shadcn) plus feature folders
lib/
  actions/       server actions
  services/      business logic
  repositories/  Supabase data access
  crypto/        client encryption, key derivation, hashing, credential signing
  supabase/      server/client/middleware helpers
  hooks/         TanStack Query hooks
  validations/   Zod schemas
supabase/migrations/  SQL migrations (schema source of truth)
types/           database.types.ts is generated
```

## Security rules that apply to every feature

These are not optional. Skipping them creates real vulnerabilities. This is a personal data bank; assume every change is reviewed through a threat model.

Row Level Security (RLS):

- RLS is the primary database guardrail and is enabled on nearly every table. Every new table must enable RLS and add policies scoped with `auth.uid()` (see `20260616000001_initial_schema.sql` and `20260617000002_security_hardening.sql` for the patterns).
- `SECURITY DEFINER` functions must pin `SET search_path = ''` and revoke `EXECUTE` from API roles unless they are deliberately exposed as RPCs.
- The service-role client (`lib/supabase/service.ts`) bypasses RLS entirely. Never use it to serve user-facing reads or writes. When it is unavoidable (registration, API-key auth, webhooks), the repository-layer `userId` filter is the only thing protecting the user, so it must be present and correct.

Never log or expose (threat-model "never do" list):

- Plaintext vault data, the master key, derived keys, DEKs, salts, passwords, or session tokens. Not in logs, errors, analytics, or responses.
- Keep unencrypted metadata minimal. Columns like `label`, `category`, and `tags` are queryable and therefore visible to the server; never put sensitive content there.
- Do not weaken PBKDF2 iterations, reuse IVs, or roll your own crypto. Use the helpers in `lib/crypto/`.

Encryption (client-side):

- Encrypt vault data in the browser before it reaches the server. Use `lib/crypto/client-crypto.ts` (AES-GCM) and `lib/crypto/key-derivation.ts` (PBKDF2, 600k iterations).
- Use envelope encryption: encrypt data with a per-entry DEK, wrap the DEK with the user's master key, and send only `client_ciphertext`, `encrypted_dek`, and `dek_salt`.
- Treat those three fields as required and non-empty for any write. Validate them in the action (Zod schema in `lib/validations/`) before calling the service. Never write a partial or plaintext row. Note: the current vault path accepts a typed payload without a Zod `parse`; new and refactored writes should add the schema check.
- Server-held keys exist only for issuer signing: Ed25519 private keys are AES-256-GCM-wrapped with `ISSUER_KEY_SECRET` (`lib/crypto/credential-signing.ts`).

Audit logging:

- Write an audit log for every sensitive operation (create, read, update, delete, grant, revoke).
- Include `previousHash` to keep the chain intact. Use `createAuditHash()` from `lib/crypto/hashing.ts`.
- Never modify existing audit rows. The chain is immutable and verified with `verifyHashChain()`.

Authentication and ownership:

- Resolve the user from the session in every server action and route handler. Never accept a user id from the client.
- Check that `user` exists before proceeding.
- Filter every query by the authenticated `userId` in the repository layer, even when RLS would also apply (defense in depth).

## Conventions

- Default to Server Components. Add `'use client'` only for state, effects, or event handlers.
- Validate all input with Zod from `lib/validations/`. Use `.parse()` in actions and services (throws), `.safeParse()` in forms. Some existing actions accept typed payloads without parsing; treat Zod validation as the standard for new code and tighten old paths when you touch them.
- Use the `cn()` helper for className merging and follow shadcn/ui patterns for new UI.
- Naming: kebab-case files, PascalCase components and types, camelCase functions, UPPER_SNAKE_CASE constants, snake_case database columns.
- Path alias `@/*` maps to the project root.
- TypeScript strict mode is on. Type parameters and return values.

## User-facing copy

When you write or edit user-facing text (UI labels, buttons, empty states, errors, toasts, onboarding, emails), apply the humanizer rules in [.github/skills/humanizer/SKILL.md](.github/skills/humanizer/SKILL.md). Use plain, neutral, second-person voice. Avoid em dashes, emoji in headings, Title Case headings, and promotional or rule-of-three phrasing. Confirm the copy matches the current Supabase plus client-side encryption model.

## Testing

- Unit and component tests run on Vitest. Crypto tests live in `lib/crypto/__tests__/` (`hashing`, `client-crypto`, and `key-derivation` are covered).
- Any change to `lib/crypto/` must ship tests: round-trip encrypt/decrypt, key derivation determinism for a fixed password and salt, and audit-chain verification including a tamper case. Add known-answer vectors where practical so behavior cannot silently drift.
- End-to-end flows run on Playwright (`npm run test:e2e`), specs in `__tests__/e2e/`.

## Commit and pull request conventions

- There is no enforced commit hook or PR template, so apply these manually.
- Use clear, imperative commit subjects (Conventional Commits style, e.g. `feat: add consent expiry`). Keep unrelated changes in separate commits.
- Add this trailer unless asked otherwise:
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
- Never commit secrets or `.env.local`. Run `git diff --staged` before committing to confirm no keys, tokens, or plaintext slipped in.
- In the PR description, call out security-relevant changes: new tables and their RLS policies, any service-role usage, new env vars, and crypto changes.

## CI

`.github/workflows/ci.yml` runs lint and the Vitest unit suite on pushes to `main` and on every pull request. It does not run Playwright e2e (those need browser downloads and a running app plus Supabase). Still run `npm run lint` and `npm run test:run` locally before committing, and `npm run test:e2e` when you change UI flows.

## Before you finish

- Run `npm run lint` and `npm run test:run` for code changes.
- Confirm new vault paths encrypt in the browser and write an audit entry.
- Confirm every new table has RLS enabled with `auth.uid()`-scoped policies, and every new query is scoped by the authenticated `userId`.
- Confirm no service-role client is used for user-facing data, and no secrets or plaintext appear in logs, errors, or the diff.
- Regenerate `types/database.types.ts` if you changed the schema.
