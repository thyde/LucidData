// Dev-only helper: mark an organization's domain as verified and enable data buying,
// so the issuer/credential and buyer flows can be exercised locally without real DNS.
// Usage: node scripts/dev-verify-org.mjs <org-email-or-name>
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[m[1]] = v
  }
  return env
}

const env = loadEnv('.env.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const ident = process.argv[2]
if (!ident) {
  console.error('Usage: node scripts/dev-verify-org.mjs <org-email-or-name>')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data: orgs, error: selErr } = await supabase
  .from('organizations')
  .select('id, name, email, org_type, data_buyer, verified_at, domain')
  .or(`email.eq.${ident},name.eq.${ident}`)

if (selErr) {
  console.error('Lookup failed:', selErr.message)
  process.exit(1)
}
if (!orgs || orgs.length === 0) {
  console.error('No organization matched:', ident)
  process.exit(1)
}

for (const org of orgs) {
  const { data, error } = await supabase
    .from('organizations')
    .update({
      verified_at: new Date().toISOString(),
      data_buyer: true,
      org_type: 'both',
      domain: org.domain ?? 'example.com',
    })
    .eq('id', org.id)
    .select('id, name, email, org_type, data_buyer, verified_at, domain')
    .single()
  if (error) {
    console.error('Update failed:', error.message)
    process.exit(1)
  }
  console.log('Updated:', data)
}
