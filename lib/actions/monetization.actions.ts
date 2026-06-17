'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getFieldMonetization,
  getAllFieldMonetization,
  setFieldMonetization,
  getSalePreferences,
  setSalePreferences,
} from '@/lib/services/monetization.service'
import { fieldMonetizationSchema, salePreferencesSchema } from '@/lib/validations/marketplace'
import type { VaultFieldMonetization, SalePreferences } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getFieldMonetizationAction(
  vaultDataId: string
): Promise<VaultFieldMonetization[]> {
  const userId = await getAuthenticatedUserId()
  return getFieldMonetization(vaultDataId, userId)
}

export async function getAllFieldMonetizationAction(): Promise<VaultFieldMonetization[]> {
  const userId = await getAuthenticatedUserId()
  return getAllFieldMonetization(userId)
}

export async function setFieldMonetizationAction(input: unknown): Promise<void> {
  const userId = await getAuthenticatedUserId()
  const parsed = fieldMonetizationSchema.parse(input)
  return setFieldMonetization(userId, parsed)
}

export async function getSalePreferencesAction(): Promise<SalePreferences | null> {
  const userId = await getAuthenticatedUserId()
  return getSalePreferences(userId)
}

export async function setSalePreferencesAction(input: unknown): Promise<SalePreferences> {
  const userId = await getAuthenticatedUserId()
  const parsed = salePreferencesSchema.parse(input)
  return setSalePreferences(userId, parsed)
}
