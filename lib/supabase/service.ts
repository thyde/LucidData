import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// Service role client -- bypasses RLS. Server-only.
export function createServiceClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is not configured')

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
