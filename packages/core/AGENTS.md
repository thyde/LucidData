# AGENTS.md - packages/core

`@luciddata/core` is the code every LucidData client shares: the web app today, and the phone app and extensions as they are built. It exists so that a vault encrypted on one device opens on another and a record validated in one place is valid everywhere, with one copy of the logic instead of several that drift. See the root [AGENTS.md](../../AGENTS.md) for the project-wide rules.

## What belongs here

Pure TypeScript that any client needs and that behaves the same everywhere:

- `src/crypto/` - vault encryption. Read [src/crypto/AGENTS.md](src/crypto/AGENTS.md) first.
- `src/schemas/` - the vault schema registry and the form fields for each schema.
- `src/validations/` - Zod schemas for every input.
- `src/privacy/` - how each schema field is classified for the privacy gate.
- `src/vault/` - import parsers and the provider export adapters.
- `src/connectors/` - normalizers that turn provider records into vault records.
- `src/utils/` - pure helpers the above need, such as rights deadlines.

What does not belong here: anything that touches the DOM, the server, the network, the environment, or a framework. The server-side release gate in `lib/privacy/k-anonymity.ts` stays in the web app for that reason, and so does saving a file in `lib/utils/download.ts`.

## Rules

- No imports from `next`, `react`, `@supabase/*`, `server-only`, `stripe`, Node built-ins, or the web app's `@/` alias. ESLint refuses them by name.
- Imports inside the package are relative and stay inside `src/`. Every bare import must be declared in `package.json`; today that is only `zod`. `src/__tests__/boundary.test.ts` checks both.
- Use `globalThis`, never `window`, `document`, `process`, or `Buffer`.
- No server-action errors. A module here can throw a plain `Error`; deciding what a person is told is the app's job.
- The package ships TypeScript source. The web app compiles it through `transpilePackages` in `next.config.ts`, so there is no build step to keep in sync.
- Import it from the app as `@luciddata/core/<path>`, for example `@luciddata/core/validations/vault`. `package.json` maps each path to its source file.

## Tests

Tests sit next to the code in `__tests__/` folders and run with the rest of the suite (`npm run test:run`). A test inside the package may use Node to read fixtures, but it may not import from the web app either.
