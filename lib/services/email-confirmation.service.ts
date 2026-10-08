/**
 * LD-610 email confirmation.
 *
 * Credentials, credential requests, and consent requests reach people by email
 * address, so an account must prove it controls its address before it can
 * receive any of them.
 *
 * Confirming is not signing in. Verifying the link creates a session, and that
 * session is ended here straight away: the vault key is derived from the
 * password, so the person signs in with it next, and that first sign-in sets
 * the vault up.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { EmailConfirmationType } from '@/lib/validations/account'

/** True when the link was valid and the address is now confirmed. */
export async function confirmEmailAddress(
  tokenHash: string,
  type: EmailConfirmationType
): Promise<boolean> {
  // A client that keeps nothing, so no cookie is set and no session outlives
  // this call.
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    }
  )

  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error || !data.user) return false

  if (data.session) {
    // Scope 'local' ends only the session this link created.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
  return true
}
