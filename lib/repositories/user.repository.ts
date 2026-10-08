import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { User } from '@/types/database.types'

export async function findUserById(id: string): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Store a key salt only if the account has none, then return whichever salt is
 * stored. Two tabs finishing setup at once both get the same answer, and the
 * database refuses to replace a salt that is already set.
 *
 * Uses the service role, filtered to the caller's id, because the API roles may
 * not write the salt: changing it would leave every entry wrapped under a key
 * that the person's password no longer derives.
 */
export async function setKeySaltIfUnset(id: string, keySalt: string): Promise<string | null> {
  const service = createServiceClient()
  const { error } = await service
    .from('users')
    .update({ key_salt: keySalt, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('key_salt', null)
  if (error) throw error

  const { data, error: readError } = await service
    .from('users')
    .select('key_salt')
    .eq('id', id)
    .single()
  if (readError) throw readError
  return data.key_salt
}

/**
 * Columns the person's own session may change. The key salt and the recovery
 * escrow are written only by the services that guard them, through the service role.
 */
export async function updateUser(id: string, updates: {
  display_name?: string
  key_hint?: string
  recovery_setup_declined_at?: string | null
  recovery_last_confirmed_at?: string | null
  onboarding_completed?: boolean
  email_notifications_enabled?: boolean
}): Promise<User> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Read the email-notification preference for any user. Notifications are often
// created for a different user than the actor (RLS would hide that row), so this
// uses the service role. Defaults to enabled if the row is missing.
export async function getEmailNotificationsEnabled(userId: string): Promise<boolean> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('users')
    .select('email_notifications_enabled')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.email_notifications_enabled ?? true
}

// Read a user's email for notification delivery. Notifications are often created
// for a different user than the actor, so this uses the service role. Returns
// null if the user has no row.
export async function getUserEmail(userId: string): Promise<string | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data?.email as string | undefined) ?? null
}
