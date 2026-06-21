import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyIssuedCredential, type CredentialVerification } from '@/lib/services/credential.service'
import { createAuditEntry } from '@/lib/services/audit.service'
import { recordUsage } from '@/lib/services/billing.service'
import type { CredentialShare, IssuedCredential } from '@/types/database.types'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export interface CreatedShare {
  share: CredentialShare
  token: string
}

/**
 * Create a tokenized, revocable share for a credential the user owns, exposing
 * only the chosen claim keys. Returns the raw token (shown once).
 */
export async function createShare(
  userId: string,
  credentialId: string,
  disclosedClaims: string[],
  options: {
    expiresAt?: string | null
    verifierEmail?: string | null
    credentialRequestId?: string | null
  } = {}
): Promise<CreatedShare> {
  const service = createServiceClient()

  const { data: credential, error: credErr } = await service
    .from('issued_credentials')
    .select('id, subject_user_id')
    .eq('id', credentialId)
    .maybeSingle()
  if (credErr) throw credErr
  if (!credential || credential.subject_user_id !== userId) {
    throw new Error('Credential not found')
  }

  const token = crypto.randomBytes(32).toString('base64url')
  const { data, error } = await service
    .from('credential_shares')
    .insert({
      credential_id: credentialId,
      user_id: userId,
      token_hash: hashToken(token),
      disclosed_claims: disclosedClaims,
      verifier_email: options.verifierEmail ?? null,
      credential_request_id: options.credentialRequestId ?? null,
      expires_at: options.expiresAt ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'credential_shared',
    action: `Shared credential ${credentialId} (${disclosedClaims.length} fields)`,
    metadata: { credentialId, disclosedClaims },
  })

  return { share: data as CredentialShare, token }
}

export async function listSharesForUser(userId: string): Promise<CredentialShare[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('credential_shares')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CredentialShare[]
}

export async function revokeShare(userId: string, shareId: string): Promise<void> {
  const service = createServiceClient()
  const { error } = await service
    .from('credential_shares')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('user_id', userId)
  if (error) throw error
}

export interface PublicShareView {
  issuerName: string
  issuerVerified: boolean
  label: string
  schemaType: string
  issuedAt: string
  expiresAt: string | null
  /** Only the claim keys the holder chose to disclose. */
  disclosedClaims: Record<string, unknown>
  verification: CredentialVerification
}

/**
 * Resolve a share token for the public verify page. Verifies the issuer
 * signature over the full credential, then returns ONLY the disclosed claims so
 * undisclosed fields never reach the verifier. Records the view.
 */
export async function resolveShareToken(token: string): Promise<PublicShareView | null> {
  const service = createServiceClient()
  const { data: shareRow, error } = await service
    .from('credential_shares')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error) throw error
  if (!shareRow) return null
  const share = shareRow as CredentialShare

  const reasons: string[] = []
  if (share.revoked) reasons.push('Share was revoked by the holder')
  if (share.expires_at && new Date(share.expires_at) < new Date()) reasons.push('Share link has expired')

  const { data: credential } = await service
    .from('issued_credentials')
    .select('*')
    .eq('id', share.credential_id)
    .maybeSingle()
  if (!credential) return null
  const cred = credential as IssuedCredential

  const credVerification = await verifyIssuedCredential(cred)

  const { data: org } = await service
    .from('organizations')
    .select('name, verified_at')
    .eq('id', cred.organization_id)
    .maybeSingle()

  // Project only the disclosed claim keys.
  const allClaims = (cred.claims ?? {}) as Record<string, unknown>
  const disclosed: Record<string, unknown> = {}
  for (const key of share.disclosed_claims) {
    if (key in allClaims) disclosed[key] = allClaims[key]
  }

  // Record the view (best-effort) and audit-log for the holder.
  await service
    .from('credential_shares')
    .update({ view_count: share.view_count + 1, last_viewed_at: new Date().toISOString() })
    .eq('id', share.id)
  await createAuditEntry({
    userId: share.user_id,
    eventType: 'credential_share_viewed',
    action: `Shared credential ${cred.id} was viewed`,
    actorType: 'system',
    metadata: { shareId: share.id, credentialId: cred.id },
  }).catch(() => {})
  await recordUsage(cred.organization_id, 'credential_verified', { credentialId: cred.id, shareId: share.id }).catch(() => {})

  return {
    issuerName: org?.name ?? 'Unknown issuer',
    issuerVerified: Boolean(org?.verified_at),
    label: cred.label,
    schemaType: cred.schema_type,
    issuedAt: cred.issued_at,
    expiresAt: cred.expires_at,
    disclosedClaims: disclosed,
    verification: {
      valid: credVerification.valid && reasons.length === 0,
      reasons: [...credVerification.reasons, ...reasons],
    },
  }
}
