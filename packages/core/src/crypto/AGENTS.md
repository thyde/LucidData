# AGENTS.md - packages/core/src/crypto

Scoped guidance for vault encryption. This is the most security-sensitive code in the project: it decides whether LucidData can read anyone's data. Changes here can silently break confidentiality, so treat every edit as high-risk. The server-side crypto has its own guidance in [lib/crypto/AGENTS.md](../../../../lib/crypto/AGENTS.md), and the package rules are in [packages/core/AGENTS.md](../../AGENTS.md).

## What lives here

- `runtime.ts` - finds Web Crypto, random bytes, UTF-8, and base64 on whatever runtime is present: a browser, React Native's Hermes, or an extension worker. Every other module goes through it.
- `key-derivation.ts` - PBKDF2 master-key derivation from the user's password and `key_salt` (600k iterations).
- `client-crypto.ts` - AES-GCM encrypt/decrypt and DEK wrapping for the envelope scheme.
- `recovery.ts` - recovery codes and kits: wrapping a copy of the master key under each, and opening the vault again with whichever one the person kept, checked against one of the vault's entries.
- `ingestion-keys.ts` - the ECDH P-256 keypair that lets a connector seal records it cannot read.
- `anonymize.ts` - strips direct identifiers before a marketplace contribution leaves the device.
- `vault-export.ts` - builds the JSON-LD export document. Saving it is the app's job.

All of it runs on the person's device. None of it may run on the server with a real key.

## Hard rules

- Do not roll your own primitives. Use Web Crypto through `runtime.ts`.
- The server never receives the password, the master key, or any DEK in plaintext. Nothing here may send one.
- Do not change algorithm parameters (PBKDF2 iteration count, key length, IV length, GCM tag handling) without a deliberate migration plan. Lowering iterations or shortening or reusing IVs is a vulnerability. The vectors in `__tests__/vectors.test.ts` freeze the parameters, and a vault made in one runtime must open in every other.
- Generate a fresh random IV for every encryption. Never hardcode or reuse one.
- Never log key material, plaintext, salts, or IVs, even at debug level.
- Reach for `globalThis`, never `window`, and no Node built-ins: the phone app has neither.
- Every module here needs an entry in `KEY_CUSTODY` in `lib/constants/trust-disclosures.ts`, which a test enforces. The trust centre publishes this directory's paths.

## Testing requirement

Every change in this directory ships with tests (Vitest, in `__tests__/`). At minimum:

- Round-trip: encrypt then decrypt returns the original plaintext, and decryption fails on a tampered ciphertext or wrong key.
- Determinism: the same password and salt derive the same master key; different salts derive different keys.
- Known-answer vectors, so behavior cannot drift unnoticed between the web app and the phone app.

Run `npm run test:run` before committing.
