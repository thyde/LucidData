import { config } from 'dotenv'
import path from 'node:path'

const SYNTHETIC_EMAIL = /^(?:test|audit|consent|dashboard|nav|vault|market|settings|credential)-.*@example\.com$/

export default async function globalTeardown() {
  config({ path: path.resolve(process.cwd(), '.env.test') })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and service key are required for E2E cleanup')

  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  let page = 1

  for (;;) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers })
    if (!response.ok) throw new Error(`Could not list E2E users: ${response.status}`)
    const data = (await response.json()) as { users: Array<{ id: string; email?: string }> }
    const synthetic = data.users.filter((user) => SYNTHETIC_EMAIL.test(user.email ?? ''))

    for (const user of synthetic) {
      await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers })
    }

    if (data.users.length < 1000) break
    page += 1
  }
}
