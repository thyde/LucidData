# AGENTS.md - lib/crypto

Scoped guidance for the server side of the cryptography layer. Vault encryption, the part that runs on the person's device, lives in [packages/core/src/crypto/](../../packages/core/src/crypto/AGENTS.md) and has its own guidance. See the root [AGENTS.md](../../AGENTS.md) for the project-wide rules.

## What lives here

- `hashing.ts` - SHA-256 audit hash chain: `createAuditHash()` and `verifyHashChain()`.
- `credential-signing.ts` / `credential-verify.ts` - Ed25519 issuer signing and verification; private keys are AES-256-GCM-wrapped with `ISSUER_KEY_SECRET`.
- `consent-receipt.ts` / `deletion-receipt.ts` - Ed25519-signed receipts that LucidData issues about consent terms and account erasure.

Everything here runs on the server with Node `crypto`. None of it may handle a password, a master key, or a data key.

## Hard rules

- Do not roll your own primitives. Use Node `crypto`, which is already wired up here.
- Keep the boundary clear. The server never receives the password, the master key, or any DEK in plaintext, so nothing here may expect one.
- Do not change algorithm parameters (key length, IV length, GCM tag handling) without a deliberate migration plan.
- Generate a fresh random IV for every encryption. Never hardcode or reuse one.
- The audit chain is append-only. `verifyHashChain()` must keep detecting any reordering or mutation; do not add a "repair" path that rewrites historical hashes.
- Never log key material, plaintext, salts, or IVs, even at debug level.
- Every module here needs an entry in `KEY_CUSTODY` in `lib/constants/trust-disclosures.ts`, which a test enforces.

## Testing requirement

Every change in this directory ships with tests (Vitest, in `__tests__/`). At minimum:

- Audit chain: a valid chain verifies, and a single mutated or reordered entry makes `verifyHashChain()` fail.
- Signing: a signature verifies, and fails on a changed payload or the wrong key.
- Prefer known-answer vectors for signing so behavior cannot drift unnoticed.

Run `npm run test:run` before committing.
