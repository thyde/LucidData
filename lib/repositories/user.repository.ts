import { createClient } from '@/lib/supabase/server'
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

export async function updateUser(id: string, updates: { display_name?: string; key_salt?: string; key_hint?: string }): Promise<User> {
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
