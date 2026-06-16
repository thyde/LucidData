'use server'

import { createClient } from '@/lib/supabase/server'
import { createConsent, getUserConsents, getConsentById, revokeConsent, extendConsent, getConsentStatus } from '@/lib/services/consent.service'
import type { Consent } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getConsentsAction(): Promise<Consent[]> {
  const userId = await getAuthenticatedUserId()
  return getUserConsents(userId)
}

export async function getConsentAction(id: string): Promise<Consent | null> {
  const userId = await getAuthenticatedUserId()
  return getConsentById(id, userId)
}

export async function createConsentAction(payload: {
  vault_data_id?: string
  granted_to: string
  granted_to_name?: string
  granted_to_email?: string
  access_level: 'read' | 'export' | 'verify'
  purpose: string
  end_date?: string
  consent_type?: 'explicit' | 'implied'
}): Promise<Consent> {
  const userId = await getAuthenticatedUserId()
  return createConsent(userId, payload)
}

export async function revokeConsentAction(id: string, reason: string): Promise<Consent> {
  const userId = await getAuthenticatedUserId()
  return revokeConsent(id, userId, reason)
}

export async function extendConsentAction(id: string, newEndDate: string): Promise<Consent> {
  const userId = await getAuthenticatedUserId()
  return extendConsent(id, userId, newEndDate)
}

export { getConsentStatus }
