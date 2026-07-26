'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/** Verify password knowledge without replacing or downgrading the active browser session. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  return !error
}