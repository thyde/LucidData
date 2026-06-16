import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// Service role client -- bypasses RLS. Server-only.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
