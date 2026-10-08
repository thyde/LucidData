# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before making changes. For the full reference, see [.github/copilot-instructions.md](.github/copilot-instructions.md). The crypto layer has nested guidance in [lib/crypto/AGENTS.md](lib/crypto/AGENTS.md) for the server modules and [packages/core/src/crypto/AGENTS.md](packages/core/src/crypto/AGENTS.md) for vault encryption; read the matching one before touching either directory.

Planned work lives in exactly one place. [docs/competitive-feature-roadmap.md](docs/competitive-feature-roadmap.md) is the single definitive roadmap: the prioritized list of features to build and gaps to close, with numbered specs an agent can execute one at a time. Do not plan from the README or from design documents under `docs/`.

## Budget

Spending on this project has a hard limit of $150 a month across every paid service. Do not take any action that could push the monthly total over it without the owner's explicit permission in the conversation. Tokens and time do not count toward the limit.

- Before anything that adds or raises a charge (a plan change, compute size, add-on, new paid service, domain, seat, or usage beyond an included allowance), add the new cost to the committed total below. If the result is over $150, or the price is unknown, stop and ask.
- Keep every cap in place. Supabase's spend cap stays on, and Vercel's on-demand budget stays low enough that production pauses before the total can pass the limit.
- When a cost changes, update this table in the same change.

| Service | Plan | Monthly cost | Cap |
| --- | --- | --- | --- |
| Vercel | Pro, one seat | $20, plus usage beyond the $20 credit | On-demand budget of $60 pauses production at 100% |
| Supabase | Pro; production and staging on Micro compute | About $34, with production compute covered by the $10 credit | Spend cap on; compute is billed outside it |
| Domains | luciddatabank.com, .co, and .app at Vercel | About $4.25 ($51.05 a year, due July 2027, auto-renew off) | Fixed |
| Zoho Mail | Mail Lite 5 GB, one licence, yearly | About $1 | Fixed |
| Resend, Cloudflare, GitHub | Free plans | $0 | Free-tier limits |

Committed total: about $60 a month. With every cap reached: about $120. Recorded 2026-10-06.

## What this project is

LucidData is a privacy-first personal data bank. Users own, control, and share their data on their terms. The app is built with Next.js 16.2.10 (App Router, React 19.2.7), Supabase (Postgres, Auth, Realtime), and client-side encryption using the Web Crypto API.

Core ideas:

- Treat user data as property, not product.
- Encrypt vault data in the browser. The server never sees plaintext, the master key, or the password.
- Keep an immutable, tamper-evident audit trail via SHA-256 hash chains.
- Grant access with granular, time-bound consent.

## Setup and commands

Requirements: Node.js 22 or later, npm, Docker Desktop, and the Supabase CLI (installed as a dev dependency).

```bash
npm install            # install dependencies
npx supabase start     # start local Postgres/Auth/Studio and apply migrations
npm run dev            # start the app at http://localhost:3000
```

Common scripts (see package.json for the full list):

- `npm run dev` - start the Webpack dev server (binds 0.0.0.0).
- `npm run build` - production Webpack build.
- `npm run lint` - run ESLint with zero warnings allowed.
- `npm test` - Vitest in watch mode. `npm run test:run` for a single run.
- `npm run test:e2e` - Playwright end-to-end tests.
- `npm run test:all` - typecheck, lint, unit tests, then e2e.
- `npm run security:audit` - audit production dependencies at high severity or above.

The dev and build scripts use Webpack explicitly because the stable Serwist 9 PWA integration is Webpack-based. Keep the `--webpack` flags until Serwist supports the default Next.js bundler in a stable release.

Database and migrations:

- Migrations are the source of truth, in `supabase/migrations/`. Add a new SQL file and run `npx supabase migration up --local`.
- Migrations are forward-only. Never edit a migration that has already been applied or deployed; write a new one. Name files `YYYYMMDDHHMMSS_short_description.sql` to keep ordering.
- Every new table MUST `ENABLE ROW LEVEL SECURITY` and ship user-scoped policies in the same migration (see RLS below). A table without RLS is exposed through the public PostgREST API with the anon key.
- Regenerate types with `npx supabase gen types` into `types/database.types.ts` after any schema change.
- Migrations reach the hosted databases only through `.github/workflows/migrations.yml`. When a migration lands on `main`, it is applied to the staging project, then to production after a reviewer approves the `migrations-production` environment. Never apply a migration to production by hand, from the dashboard, or through an MCP tool, because that puts production's history out of step with the repository.
- Vercel deploys `main` straight away, but the production migration waits for approval. Ship a schema change in its own pull request, approve its production run, then merge the code that depends on it. Removing a column or table follows the reverse order: stop using it first, then drop it.
- `supabase/tests/database/` holds pgTAP tests that CI runs against a database built from every migration. They check that every public table has RLS, that every `SECURITY DEFINER` function pins `search_path` and is closed to `anon`, and that signed-in users can execute only a reviewed list of them. Exposing a new RPC means adding it to that list.
- There is no ORM. Do not add Prisma.

Environment variables (never commit `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase client config.
- `SUPABASE_SECRET_KEY` - preferred server-only key for current Supabase Auth admin APIs.
- `SUPABASE_SERVICE_ROLE_KEY` - legacy server-only fallback.
- `ISSUER_KEY_SECRET` - base64 32-byte key that AES-256-GCM-wraps issuer private keys (credential issuance only).
- `NEXT_PUBLIC_RP_ID` - WebAuthn relying-party id (`localhost` in dev).

There is no `ENCRYPTION_KEY`. Vault keys are derived in the browser from the user's password, so the server cannot decrypt vault data.

Vercel variables are set by hand, per environment: production holds production keys, and preview holds the staging project's. Do not reconnect the Supabase Vercel integration. It rewrites the Supabase Auth redirect allowlist on every deployment with `*.vercel.app` patterns that a stranger's Vercel project can match, which turns a password-reset email into an account takeover. Production's allowlist must stay at exactly `https://luciddatabank.com/recover-vault`.

## Architecture

Mutations flow through four layers. Never touch the database directly from components or route handlers.

1. Server action in `lib/actions/` (`'use server'`). Resolve the user with a local `getAuthenticatedUserId()` helper that calls `supabase.auth.getUser()` and throws on no session, validate input against the matching schema in `packages/core/src/validations/`, then call a service. Never trust a client-supplied user id.
2. Service in `lib/services/`. Business logic, validation, and audit logging.
3. Repository in `lib/repositories/`. Supabase reads and writes, always scoped by `userId`.
4. Supabase client. Use `lib/supabase/server.ts` in server code and `lib/supabase/client.ts` in Client Components. `lib/supabase/service.ts` is the service-role client; see the RLS warning before using it.

The web app mutates through server actions, not REST handlers. Route handlers under `app/api/` are for auth, org, and webhook-style endpoints, plus the versioned client API in `app/api/v1/` that the phone app and the extension call. The action surface is broad (17 domains): vault, consent, consent-request, credential, credential-request, issuer, share, audit, account, notification, billing, monetization, marketplace, offer, data-order, contribution, and insights. New features follow the same four-layer flow.

Directory layout:

```
app/
  (auth)/        sign-in, register, passkey, signup
  (dashboard)/   vault, consent, audit, credentials, requests, settings
  (marketing)/   public marketing pages
  (org)/         organization and credential-issuer routes
  api/           auth, org, and webhook route handlers
  api/v1/        the client API for the phone app and the extension
components/      ui/ (shadcn) plus feature folders
lib/
  actions/       server actions
  api/v1/        the client API's handler wrapper and OpenAPI document
  services/      business logic
  repositories/  Supabase data access
  crypto/        server crypto: audit hashing, credential and receipt signing
  supabase/      server/client/session helpers
  hooks/         TanStack Query hooks
packages/core/   @luciddata/core, shared with the phone app and the extension
  src/crypto/       vault encryption, key derivation, recovery, sealed ingestion
  src/schemas/      vault schema registry and form fields
  src/validations/  Zod schemas
  src/privacy/      field classification for the privacy gate
  src/vault/        import parsers and provider export adapters
  src/connectors/   fitness record normalizers
supabase/migrations/  SQL migrations (schema source of truth)
types/           database.types.ts is generated
```

`packages/core` is an npm workspace that ships TypeScript source; import it as `@luciddata/core/<path>`, for example `@luciddata/core/crypto/client-crypto`. It may not import Next.js, React, the Supabase clients, Node built-ins, or anything from the web app, and inside the package imports are relative. ESLint and `packages/core/src/__tests__/boundary.test.ts` enforce this. Code that touches the DOM, the server, or the environment stays in the web app. Read [packages/core/AGENTS.md](packages/core/AGENTS.md) before adding to it.

### Client API

`app/api/v1/` serves every client that is not the web app. Each handler is wrapped in `v1()` from `lib/api/v1/handler.ts`, which checks the bearer token with Supabase Auth, refuses revoked sessions and sessions that skipped a verified second factor, rate limits per person, and runs the handler with the person's token. Inside that call `createClient()` from `lib/supabase/server.ts` sends the token instead of cookies, so one service serves both surfaces and row level security applies to both.

- Call the service function the matching server action calls. Put new logic in the service, never in the handler.
- Never use the service-role client in a v1 handler, and never read a user id from the request. `lib/api/v1/__tests__/routes.test.ts` fails the build on either.
- Validate bodies with the schemas in `packages/core/src/validations/client-api.ts`, and add every new route to `ROUTES` in `lib/api/v1/openapi.ts`. The routes test checks that the document and the route files match, and the snapshot shows the change in review.
- Expected failures are `UserFacingError`s with a code. The wrapper turns `not_found` into 404, `conflict` and `recovery_required` into 409, `health_consent_required` into 403, `rate_limited` into 429, and any other refusal into 400. Every other error is logged and returned as a generic 500.
- A route file may export only HTTP methods and segment config such as `dynamic`. Next.js type-checks this during the build, not during `npm run typecheck`.

## Security rules that apply to every feature

These are not optional. Skipping them creates real vulnerabilities. This is a personal data bank; assume every change is reviewed through a threat model.

Row Level Security (RLS):

- RLS is the primary database guardrail and is enabled on every public table. Every new table must enable RLS and add policies scoped with `(SELECT auth.uid())` so PostgreSQL evaluates the session user once per statement (see `20260725031537_schema_constraints_and_rls_performance.sql`).
- A policy also governs direct API access. PostgREST exposes every public table, so whatever a policy lets a signed-in person do, they can do with their own session and the public key, skipping every check in the action and the service. Grant API roles only what a person may do unaided. Use column-level `GRANT UPDATE (...)` where some columns are the server's to set, as on `users` and the request tables, and grant no write at all on rows whose values the server must compute or check, such as contributions and shares. `supabase/tests/database/direct-write-guards.test.sql` shows how to test this.
- A trigger on a table that another table references with `ON DELETE SET NULL` also fires on the update that clears the reference. Compare `OLD` and `NEW` and let that update through, or deleting the referenced row will fail.
- `SECURITY DEFINER` functions must pin `SET search_path = ''` and revoke `EXECUTE` from API roles unless they are deliberately exposed as RPCs.
- A function called through PostgREST must not raise SQLSTATE `40001` (serialization_failure) or `40P01` (deadlock_detected) for an expected refusal. PostgREST retries those, so a refusal that fails the same way every time hangs the request until it times out. Raise `PTxyz` instead, which PostgREST answers with HTTP status `xyz`, for example `PT409` for a conflict.
- The service-role client (`lib/supabase/service.ts`) bypasses RLS entirely. Never use it to serve user-facing reads or writes. When it is unavoidable (registration, API-key auth, webhooks, and rows API roles may not write, such as contributions and shares), the repository-layer `userId` filter, taken from the authenticated session, is the only thing protecting the user, so it must be present and correct.

Never log or expose (threat-model "never do" list):

- Plaintext vault data, the master key, derived keys, DEKs, salts, passwords, or session tokens. Not in logs, errors, analytics, or responses.
- Keep unencrypted metadata minimal. Columns like `label`, `category`, and `tags` are queryable and therefore visible to the server; never put sensitive content there.
- Do not weaken PBKDF2 iterations, reuse IVs, or roll your own crypto. Use the helpers in `packages/core/src/crypto/` and `lib/crypto/`.

Encryption (client-side):

- Encrypt vault data in the browser before it reaches the server. Use `packages/core/src/crypto/client-crypto.ts` (AES-GCM) and `packages/core/src/crypto/key-derivation.ts` (PBKDF2, 600k iterations).
- Use envelope encryption: encrypt data with a per-entry DEK, wrap the DEK with the user's master key, and send only `client_ciphertext`, `encrypted_dek`, and `dek_salt`.
- Treat those three fields as required and non-empty for any write. Validate them in the action (Zod schema in `packages/core/src/validations/`) before calling the service. Never write a partial or plaintext row. Note: the current vault path accepts a typed payload without a Zod `parse`; new and refactored writes should add the schema check.
- Server-held keys exist only for issuer signing: Ed25519 private keys are AES-256-GCM-wrapped with `ISSUER_KEY_SECRET` (`lib/crypto/credential-signing.ts`).

Keys and recovery:

- Any change to how the vault's keys are wrapped or recovered needs a step-up grant, consumed in the service, never only checked in the browser. Re-wrapping entries after a password change or a recovery uses `change_password`, adding a kit or replacing the recovery code uses `add_recovery_factor`, and removing a factor uses `remove_recovery_factor`. Setting up the first recovery code needs none. `lib/services/__tests__/session-security.service.test.ts` fails if a listed action is consumed nowhere.
- Do not add step-up to consent withdrawal. Withdrawing consent must stay as easy as giving it (GDPR Article 7(3)).
- The key salt, the recovery escrow columns, and `recovery_factors` are written only by the services that guard them, through the service role and filtered to the caller. Never write them from the person's session client; the database refuses it, and `supabase/tests/database/recovery-writes.test.sql` holds that closed.
- A new master key retires every recovery factor, because each one wraps the old key. Recovery checks a factor against one of the vault's own entries, or the connector key when there are none, before it changes anything.
- Re-wrapping goes through `rewrap_vault_keys` only, called by the account service with the service role after the step-up check. Each entry carries the wrapped key it replaces, and the connector ingestion key moves in the same transaction, because it is wrapped under the master key too.

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
- Validate all input with Zod from `packages/core/src/validations/`. Use `.parse()` in actions and services (throws), `.safeParse()` in forms. Some existing actions accept typed payloads without parsing; treat Zod validation as the standard for new code and tighten old paths when you touch them.
- Use the `cn()` helper for className merging and follow shadcn/ui patterns for new UI.
- Naming: kebab-case files, PascalCase components and types, camelCase functions, UPPER_SNAKE_CASE constants, snake_case database columns.
- Path alias `@/*` maps to the project root.
- TypeScript strict mode is on. Type parameters and return values.

## Error messages that must reach the person

React sanitizes anything thrown out of a Server Action in production. The client gets "An error occurred in the Server Components render. The specific message is omitted in production builds..." and nothing else. That is the right default for a stack trace or a database error, and the wrong outcome for a message written for the reader. It works in development, so it is easy to ship without noticing.

Return expected failures, do not throw them.

- In a service, raise `UserFacingError` from `lib/actions/action-result.ts` when the message *is* the response: a duplicate, a limit, a refusal, a validation message. Keep plain `Error` for anything operational, such as a missing environment variable, so it stays sanitized.
- In the action, wrap the body in `guarded()`. The return type becomes `T | ActionFailure`, which is deliberate: a caller cannot ignore the failure because the compiler will not let them.
- At the call site, wrap the call in `unwrap()` from `lib/actions/unwrap.ts`. It turns the returned failure back into a throw carrying the real message, so the existing `try/catch` and `error.message` handler keeps working unchanged.

Only `UserFacingError` is transported. Everything else keeps throwing and keeps being sanitized, which is what should happen to it.

`lib/actions/__tests__/error-transport.test.ts` enforces this in the build. It walks the `lib/` import graph and fails if an action that can reach a `UserFacingError` is not wrapped, or if an action file wraps some of its exported functions but not others. If you add a `UserFacingError` to a service, expect that test to tell you which actions now need `guarded()`. Deriving a type from a guarded action needs `ActionData<T>` rather than `Awaited<ReturnType<...>>`, otherwise the failure case leaks into the derived type.

## User-facing copy

When you write or edit user-facing text (UI labels, buttons, empty states, errors, toasts, onboarding, emails), apply the humanizer rules in [.github/skills/humanizer/SKILL.md](.github/skills/humanizer/SKILL.md). Use plain, neutral, second-person voice. Avoid em dashes, emoji in headings, Title Case headings, and promotional or rule-of-three phrasing. Confirm the copy matches the current Supabase plus client-side encryption model.

## Testing

- Unit and component tests run on Vitest. Vault crypto tests live in `packages/core/src/crypto/__tests__/` (round trips, key derivation, sealed ingestion, the runtime shims, and known-answer vectors), and server crypto tests in `lib/crypto/__tests__/` (hashing, signing, receipts).
- Any change to `packages/core/src/crypto/` or `lib/crypto/` must ship tests: round-trip encrypt/decrypt, key derivation determinism for a fixed password and salt, and audit-chain verification including a tamper case. Add known-answer vectors where practical so behavior cannot silently drift.
- End-to-end flows run on Playwright (`npm run test:e2e`), specs in `__tests__/e2e/`.

## Commit and pull request conventions

- There is no enforced commit hook or PR template, so apply these manually.
- Use clear, imperative commit subjects (Conventional Commits style, e.g. `feat: add consent expiry`). Keep unrelated changes in separate commits.
- Add this trailer unless asked otherwise:
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
- Never commit secrets or `.env.local`. Run `git diff --staged` before committing to confirm no keys, tokens, or plaintext slipped in.
- In the PR description, call out security-relevant changes: new tables and their RLS policies, any service-role usage, new env vars, and crypto changes.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull request. One job runs typecheck, lint, the Vitest suite, and a production build. A second job builds a database from every migration, lints the schema with `supabase db lint`, and runs the pgTAP tests with `supabase test db`. `.github/workflows/nightly-e2e.yml` runs the Playwright suite against a production build and a local Supabase stack every night. Run `npm run test:e2e` locally when you change UI flows rather than waiting for the nightly run.

## Before you finish

- Run `npm run lint` and `npm run test:run` for code changes.
- Confirm new vault paths encrypt in the browser and write an audit entry.
- Confirm every new table has RLS enabled with `auth.uid()`-scoped policies, and every new query is scoped by the authenticated `userId`.
- Confirm no service-role client is used for user-facing data, and no secrets or plaintext appear in logs, errors, or the diff.
- Regenerate `types/database.types.ts` if you changed the schema.
- Confirm nothing you did adds a charge that takes the monthly total over $150, and update the Budget table if a cost changed.
