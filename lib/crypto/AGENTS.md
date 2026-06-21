# AGENTS.md - lib/crypto

Scoped guidance for the cryptography layer. This is the most security-sensitive code in the project. Changes here can silently break confidentiality or the integrity of the audit trail, so treat every edit as high-risk. See the root [AGENTS.md](../../AGENTS.md) for the project-wide rules.

## What lives here

- `key-derivation.ts` - PBKDF2 master-key derivation from the user's password and `key_salt` (600k iterations). Browser only.
- `client-crypto.ts` - AES-GCM encrypt/decrypt and DEK wrapping for the envelope scheme. Browser only.
- `hashing.ts` - SHA-256 audit hash chain: `createAuditHash()` and `verifyHashChain()`. Server side.
- `credential-signing.ts` / `credential-verify.ts` - Ed25519 issuer signing and verification; private keys are AES-256-GCM-wrapped with `ISSUER_KEY_SECRET`.

## Hard rules

- Do not roll your own primitives. Use the Web Crypto API (browser) and Node `crypto` (server) already wired up here.
- Keep client and server boundaries clear. Key derivation and vault encryption stay in the browser. The server never receives the password, the master key, or any DEK in plaintext.
- Do not change algorithm parameters (PBKDF2 iteration count, key length, IV length, GCM tag handling) without a deliberate migration plan. Lowering iterations or shortening/ reusing IVs is a vulnerability.
- Generate a fresh random IV for every encryption. Never hardcode or reuse one.
- The audit chain is append-only. `verifyHashChain()` must keep detecting any reordering or mutation; do not add a "repair" path that rewrites historical hashes.
- Never log key material, plaintext, salts, or IVs, even at debug level.

## Testing requirement

Every change in this directory ships with tests (Vitest, in `__tests__/`). At minimum:

- Round-trip: encrypt then decrypt returns the original plaintext, and decryption fails on a tampered ciphertext or wrong key.
- Determinism: the same password and salt derive the same master key; different salts derive different keys.
- Audit chain: a valid chain verifies, and a single mutated or reordered entry makes `verifyHashChain()` fail.
- Prefer known-answer vectors for derivation and signing so behavior cannot drift unnoticed.

Run `npm run test:run` before committing.
