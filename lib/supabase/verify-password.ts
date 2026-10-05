'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { getAuthErrorMessage } from '@/lib/utils/network-errors'

/**
 * Sign in on a client that persists nothing, so a wrong password never disturbs
 * the live browser session and a right one never replaces it. Returns null when
 * the password is wrong; any other failure, such as a CAPTCHA refusal, throws.
 */
async function signInOnce(email: string, password: string, captchaToken?: string) {
  const client = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: 'luciddata-password-check',
      },
    }
  )
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  })
  if (error) {
    if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') {
      return null
    }
    throw new Error(getAuthErrorMessage(error))
  }
  return data.session ? { client, session: data.session } : null
}

/** Verify password knowledge without replacing or downgrading the active browser session. */
export async function verifyPassword(
  email: string,
  password: string,
  captchaToken?: string
): Promise<boolean> {
  const result = await signInOnce(email, password, captchaToken)
  if (!result) return false
  // Scope 'local' ends only the check's own session; the default would sign out every device.
  await result.client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  return true
}

/**
 * Prove the password to the server without sending it there. Returns the access
 * token of a session created moments ago, which the server checks once and then
 * deletes. Null means the password was wrong.
 */
export async function createPasswordProof(
  email: string,
  password: string,
  captchaToken?: string
): Promise<string | null> {
  const result = await signInOnce(email, password, captchaToken)
  return result?.session.access_token ?? null
}