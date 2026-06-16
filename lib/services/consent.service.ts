import * as consentRepo from '@/lib/repositories/consent.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { Consent, InsertConsent } from '@/types/database.types'

export interface CreateConsentPayload {
  vault_data_id?: string
  granted_to: string
  granted_to_name?: string
  granted_to_email?: string
  access_level: 'read' | 'export' | 'verify'
  purpose: string
  end_date?: string
  consent_type?: 'explicit' | 'implied'
  ip_address?: string
  user_agent?: string
  terms_version?: string
}

export async function createConsent(userId: string, payload: CreateConsentPayload): Promise<Consent> {
  const consent = await consentRepo.createConsent({ user_id: userId, ...payload } as InsertConsent)
  await createAuditEntry({
    userId,
    eventType: 'consent_granted',
    action: `Granted ${payload.access_level} access to ${payload.granted_to_name ?? payload.granted_to}`,
    consentId: consent.id,
    vaultDataId: payload.vault_data_id,
  })
  return consent
}

export async function getUserConsents(userId: string): Promise<Consent[]> {
  return consentRepo.findConsentsByUserId(userId)
}

export async function getConsentById(id: string, userId: string): Promise<Consent | null> {
  return consentRepo.findConsentById(id, userId)
}

export async function revokeConsent(id: string, userId: string, reason: string): Promise<Consent> {
  const consent = await consentRepo.revokeConsent(id, userId, reason)
  await createAuditEntry({
    userId,
    eventType: 'consent_revoked',
    action: `Revoked consent for ${consent.granted_to_name ?? consent.granted_to}: ${reason}`,
    consentId: id,
  })
  return consent
}

export async function extendConsent(id: string, userId: string, newEndDate: string): Promise<Consent> {
  return consentRepo.updateConsent(id, userId, { end_date: newEndDate })
}

export function getConsentStatus(consent: Consent): 'active' | 'revoked' | 'expired' {
  if (consent.revoked) return 'revoked'
  if (consent.end_date && new Date(consent.end_date) < new Date()) return 'expired'
  return 'active'
}
