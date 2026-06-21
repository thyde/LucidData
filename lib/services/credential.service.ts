import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { signCredentialForOrg, getIssuerPublicKey } from '@/lib/services/issuer-key.service'
import { verifyCredentialSignature } from '@/lib/crypto/credential-verify'
import { recordUsage } from '@/lib/services/billing.service'
import { createNotification } from '@/lib/services/notification.service'
import type { IssuedCredential, Json } from '@/types/database.types'

export const CREDENTIAL_CONTEXT = 'https://luciddata.app/credentials/v1'

export interface IssuerIdentity {
  id: string
  name: string
  domain: string | null
}

export interface IssueCredentialInput {
  subjectEmail: string
  schemaType: string
  label: string
  claims: Record<string, unknown>
  expiresAt?: string | null
}

/** The canonical object that gets Ed25519-signed and stored as signed_payload. */
export interface CredentialPayload {
  '@context': string
  id: string
  type: string
  label: string
  issuer: IssuerIdentity
  subject: { email: string }
  claims: Record<string, unknown>
  issued_at: string
  expires_at: string | null
}

export interface CredentialVerification {
  valid: boolean
  reasons: string[]
}

/**
 * Mint and sign a credential for a subject email. If a user with that email
 * already exists, the credential is pre-assigned to them; otherwise it is
 * claimable once they sign up.
 */
export async function issueCredential(
  issuer: IssuerIdentity,
  input: IssueCredentialInput
): Promise<IssuedCredential> {
  const id = crypto.randomUUID()
  const issuedAt = new Date().toISOString()
  const subjectEmail = input.subjectEmail.trim().toLowerCase()

  const payload: CredentialPayload = {
    '@context': CREDENTIAL_CONTEXT,
    id,
    type: input.schemaType,
    label: input.label,
    issuer,
    subject: { email: subjectEmail },
    claims: input.claims,
    issued_at: issuedAt,
    expires_at: input.expiresAt ?? null,
  }

  const { keyId, signature } = await signCredentialForOrg(issuer.id, payload)

  const service = createServiceClient()
  const { data: existingUser } = await service
    .from('users')
    .select('id')
    .ilike('email', subjectEmail)
    .maybeSingle()

  const { data, error } = await service
    .from('issued_credentials')
    .insert({
      id,
      organization_id: issuer.id,
      subject_user_id: existingUser?.id ?? null,
      subject_email: subjectEmail,
      schema_type: input.schemaType,
      label: input.label,
      claims: input.claims as Json,
      signed_payload: payload as unknown as Json,
      signature,
      key_id: keyId,
      issued_at: issuedAt,
      expires_at: input.expiresAt ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  await recordUsage(issuer.id, 'credential_issued', { credentialId: id, schemaType: input.schemaType }).catch(() => {})
  if (existingUser?.id) {
    await createNotification({
      userId: existingUser.id,
      type: 'credential_issued',
      title: 'New credential received',
      message: `${issuer.name} issued you a credential: ${input.label}.`,
      relatedEntityId: id,
      relatedEntityType: 'issued_credential',
      email: subjectEmail,
    }).catch(() => {})
  }
  return data as IssuedCredential
}

/** All credentials an org has issued, newest first. */
export async function listIssuedCredentials(organizationId: string): Promise<IssuedCredential[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issued_credentials')
    .select('*')
    .eq('organization_id', organizationId)
    .order('issued_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as IssuedCredential[]
}

/** Revoke a credential the org issued. Verification will then fail for verifiers. */
export async function revokeCredential(
  organizationId: string,
  credentialId: string,
  reason: string
): Promise<IssuedCredential> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issued_credentials')
    .update({ status: 'revoked', revocation_reason: reason })
    .eq('id', credentialId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error) throw error
  return data as IssuedCredential
}

/**
 * Credentials visible to a user: those already assigned to them plus any
 * unclaimed credentials issued to their email.
 */
export async function getCredentialsForUser(
  userId: string,
  email: string
): Promise<IssuedCredential[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issued_credentials')
    .select('*')
    .or(`subject_user_id.eq.${userId},and(subject_user_id.is.null,subject_email.eq.${email.toLowerCase()})`)
    .order('issued_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as IssuedCredential[]
}

/**
 * Claim a credential for a user. Credentials are either pre-assigned to a known
 * user at issuance (subject_user_id set, but not yet claimed) or addressed only
 * by email (subject_user_id null). Both are handled here. Returns the updated
 * row, or null if it was not found, already claimed, or belongs to someone else.
 */
export async function claimCredential(
  credentialId: string,
  userId: string,
  email: string
): Promise<IssuedCredential | null> {
  const service = createServiceClient()
  const now = new Date().toISOString()

  // Case 1: credential was pre-assigned to this user at issuance, not yet claimed.
  const preAssigned = await service
    .from('issued_credentials')
    .update({ claimed_at: now })
    .eq('id', credentialId)
    .eq('subject_user_id', userId)
    .is('claimed_at', null)
    .select('*')
    .maybeSingle()
  if (preAssigned.error) throw preAssigned.error
  if (preAssigned.data) return preAssigned.data as IssuedCredential

  // Case 2: unassigned credential addressed to this user's email.
  const byEmail = await service
    .from('issued_credentials')
    .update({ subject_user_id: userId, claimed_at: now })
    .eq('id', credentialId)
    .is('subject_user_id', null)
    .ilike('subject_email', email)
    .select('*')
    .maybeSingle()
  if (byEmail.error) throw byEmail.error
  return (byEmail.data as IssuedCredential | null) ?? null
}

/** Link a vault entry (the user's encrypted copy) back to the credential. */
export async function linkCredentialVaultEntry(
  credentialId: string,
  userId: string,
  vaultDataId: string
): Promise<void> {
  const service = createServiceClient()
  const { error } = await service
    .from('issued_credentials')
    .update({ vault_data_id: vaultDataId })
    .eq('id', credentialId)
    .eq('subject_user_id', userId)
  if (error) throw error
}

/**
 * Verify a credential cryptographically and by lifecycle: issuer signature,
 * revocation/suspension status, and expiry.
 */
export async function verifyIssuedCredential(
  credential: IssuedCredential
): Promise<CredentialVerification> {
  const reasons: string[] = []

  const publicKey = await getIssuerPublicKey(credential.organization_id)
  if (!publicKey) {
    reasons.push('Issuer has no active signing key')
  } else {
    const sigValid = verifyCredentialSignature(
      publicKey.publicKey,
      credential.signed_payload,
      credential.signature
    )
    if (!sigValid) reasons.push('Signature does not match issuer key')
  }

  if (credential.status !== 'active') reasons.push(`Credential is ${credential.status}`)
  if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
    reasons.push('Credential has expired')
  }

  return { valid: reasons.length === 0, reasons }
}

/**
 * Map an issued credential to a W3C Verifiable Credential-shaped document for
 * portability. The Ed25519 proof is over Lucid's canonical signed_payload (not
 * JSON-LD canonicalization), so it is interoperable in structure; full LD-proof
 * conformance is a future hardening step.
 */
export function toW3cVerifiableCredential(
  credential: IssuedCredential,
  issuerName: string,
  issuerDomain: string | null
): Record<string, unknown> {
  const claims = (credential.claims ?? {}) as Record<string, unknown>
  const issuerId = issuerDomain
    ? `did:web:${issuerDomain}`
    : `urn:lucid:org:${credential.organization_id}`

  return {
    '@context': ['https://www.w3.org/ns/credentials/v2', CREDENTIAL_CONTEXT],
    id: `urn:uuid:${credential.id}`,
    type: ['VerifiableCredential', credential.schema_type],
    issuer: { id: issuerId, name: issuerName },
    validFrom: credential.issued_at,
    ...(credential.expires_at ? { validUntil: credential.expires_at } : {}),
    credentialSubject: { email: credential.subject_email, ...claims },
    credentialStatus: { type: 'LucidRevocation', status: credential.status },
    proof: {
      type: 'Ed25519Signature2020',
      created: credential.issued_at,
      verificationMethod: credential.key_id,
      proofPurpose: 'assertionMethod',
      proofValue: credential.signature,
    },
  }
}

/** Build a portable W3C VC for a credential the given user owns. */
export async function exportCredentialVc(
  userId: string,
  credentialId: string
): Promise<Record<string, unknown>> {
  const service = createServiceClient()
  const { data: credential, error } = await service
    .from('issued_credentials')
    .select('*')
    .eq('id', credentialId)
    .eq('subject_user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!credential) throw new Error('Credential not found')
  const cred = credential as IssuedCredential

  const { data: org } = await service
    .from('organizations')
    .select('name, domain')
    .eq('id', cred.organization_id)
    .maybeSingle()

  return toW3cVerifiableCredential(cred, org?.name ?? 'Unknown issuer', org?.domain ?? null)
}
