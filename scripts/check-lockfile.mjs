// Every dependency in package-lock.json must come from registry.npmjs.org and
// be pinned with sha512. An npm configured to use a mirror writes the mirror's
// tarball URLs into the lockfile, so CI and Vercel would fetch from a host this
// project does not control, and a mirror that serves only SHA-1 hashes weakens
// the pin. CI runs this before installing anything.
import { readFileSync } from 'node:fs'

// Binaries for other platforms that could not be re-hashed when the lockfile
// was repaired on 2026-10-09. npm still checks their SHA-1 on install.
const SHA1_ALLOWED = new Set([
  'node_modules/@supabase/cli-linux-arm64@2.109.1',
  'node_modules/@supabase/cli-linux-arm64-musl@2.109.1',
])

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const problems = []

for (const [path, entry] of Object.entries(lock.packages)) {
  // The root package and workspace links have no tarball.
  if (!path || entry.link || !entry.resolved || !/^https?:/.test(entry.resolved)) continue
  if (!entry.resolved.startsWith('https://registry.npmjs.org/')) {
    problems.push(`${path}: resolved from ${new URL(entry.resolved).host}`)
  }
  if (!entry.integrity) {
    problems.push(`${path}: no integrity hash`)
  } else if (!entry.integrity.startsWith('sha512-') && !SHA1_ALLOWED.has(`${path}@${entry.version}`)) {
    problems.push(`${path}: ${entry.integrity.split('-')[0]} integrity, not sha512`)
  }
}

if (problems.length > 0) {
  console.error(
    `package-lock.json has ${problems.length} problem(s):\n${problems.join('\n')}\n\n` +
      'Resolve these entries from registry.npmjs.org, with their sha512 hashes, before committing.'
  )
  process.exit(1)
}
console.log('package-lock.json: every tarball comes from registry.npmjs.org, pinned with sha512')
