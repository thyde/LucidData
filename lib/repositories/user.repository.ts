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

export async function updateUser(id: string, updates: {
  display_name?: string
  key_salt?: string
  key_hint?: string
  wrapped_master_key?: string | null
  recovery_code_salt?: string | null
  recovery_codes_generated_at?: string | null
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
