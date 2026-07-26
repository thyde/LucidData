import { createServiceClient } from '@/lib/supabase/service'
import { generateIssuerKey, signWithPrivateKey } from '@/lib/crypto/credential-signing'
import { createAuditEntry } from '@/lib/services/audit.service'
import { createNotification } from '@/lib/services/notification.service'
import type { IssuerKey } from '@/types/database.types'

/** Public (non-secret) view of an issuer's signing key. */
export interface IssuerPublicKey {
  keyId: string
  alg: 'ed25519'
  publicKey: string
}

/**
 * LD-406: how old a key may get before the portal asks the issuer to rotate.
 * Rotation is cheap and keeps the window a stolen key is useful in short.
 */
export const KEY_ROTATION_PROMPT_DAYS = 365

/** The currently active signing key for an org, or null if none exists yet. */
export async function getActiveIssuerKey(organizationId: string): Promise<IssuerKey | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issuer_keys')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as IssuerKey | null) ?? null
}

/**
 * Resolve a key by its identifier, including retired and compromised keys.
 *
 * Verification must select on the identifier recorded in the credential, never
 * on whichever key happens to be current, or rotating a key would invalidate
 * every credential signed before it.
 */
export async function getIssuerKeyById(keyId: string): Promise<IssuerKey | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issuer_keys')
    .select('*')
    .eq('key_id', keyId)
    .maybeSingle()
  if (error) throw error
  return (data as IssuerKey | null) ?? null
}

/** Every key an organization has ever held, newest first. */
export async function listIssuerKeys(organizationId: string): Promise<IssuerKey[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('issuer_keys')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as IssuerKey[]
}

/**
 * Returns the org's active signing key, generating and persisting one on first
 * use. The private key is stored only in AES-GCM-encrypted form.
 */
export async function getOrCreateActiveIssuerKey(organizationId: string): Promise<IssuerKey> {
  const existing = await getActiveIssuerKey(organizationId)
  if (existing) return existing

  const generated = generateIssuerKey()
  const service = createServiceClient()
  const { data, error } = await service
    .from('issuer_keys')
    .insert({
      organization_id: organizationId,
      key_id: generated.keyId,
      alg: 'ed25519',
      public_key: generated.publicKey,
      encrypted_private_key: generated.encryptedPrivateKey,
      private_key_iv: generated.privateKeyIv,
      valid_from: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    // A concurrent first signature won the single-active index; use its key.
    if ((error as { code?: string }).code === '23505') {
      const winner = await getActiveIssuerKey(organizationId)
      if (winner) return winner
    }
    throw error
  }
  return data as IssuerKey
}

/** Public key info safe to share with verifiers (no private material). */
export async function getIssuerPublicKey(organizationId: string): Promise<IssuerPublicKey | null> {
  const key = await getActiveIssuerKey(organizationId)
  if (!key) return null
  return { keyId: key.key_id, alg: 'ed25519', publicKey: key.public_key }
}

/**
 * Every public key the organization has held, so a verifier can still check a
 * credential signed by a key that has since been rotated out.
 */
export async function getIssuerPublicKeyHistory(
  organizationId: string
): Promise<(IssuerPublicKey & { status: string; validFrom: string; validUntil: string | null })[]> {
  const keys = await listIssuerKeys(organizationId)
  return keys.map((key) => ({
    keyId: key.key_id,
    alg: 'ed25519',
    publicKey: key.public_key,
    status: key.status,
    validFrom: key.valid_from,
    validUntil: key.valid_until,
  }))
}

/**
 * Rotate to a fresh signing key. The outgoing key is retired rather than
 * deleted, so every credential it signed stays verifiable.
 */
export async function rotateIssuerKey(
  organizationId: string,
  actingUserId: string,
  reason?: string
): Promise<IssuerKey> {
  const service = createServiceClient()
  const now = new Date().toISOString()
  const current = await getActiveIssuerKey(organizationId)

  if (current) {
    const { error } = await service
      .from('issuer_keys')
      .update({
        status: 'retired',
        retired_at: now,
        valid_until: now,
        rotation_reason: reason ?? null,
      })
      .eq('id', current.id)
      .eq('status', 'active')
    if (error) throw error
  }

  const generated = generateIssuerKey()
  const { data, error } = await service
    .from('issuer_keys')
    .insert({
      organization_id: organizationId,
      key_id: generated.keyId,
      alg: 'ed25519',
      public_key: generated.publicKey,
      encrypted_private_key: generated.encryptedPrivateKey,
      private_key_iv: generated.privateKeyIv,
      valid_from: now,
    })
    .select('*')
    .single()
  if (error) throw error

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'issuer_key_rotated',
    action: 'Rotated the organization issuer signing key',
    metadata: {
      organization_id: organizationId,
      previous_key_id: current?.key_id ?? null,
      new_key_id: generated.keyId,
      reason: reason ?? null,
    },
  })

  return data as IssuerKey
}

/**
 * Declare a key compromised.
 *
 * Everything signed after the compromise moment fails verification. Signatures
 * dated before it stay valid, because the key was still under the issuer's
 * control then, but verifiers are told to re-check. Every affected subject is
 * notified: a forged credential about them is their problem too.
 */
export async function declareIssuerKeyCompromised(
  organizationId: string,
  actingUserId: string,
  keyId: string,
  compromisedAt: string
): Promise<{ affectedCredentials: number }> {
  const service = createServiceClient()
  const key = await getIssuerKeyById(keyId)
  if (!key || key.organization_id !== organizationId) {
    throw new Error('Signing key not found for this organization')
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('issuer_keys')
    .update({
      status: 'compromised',
      compromised_at: compromisedAt,
      valid_until: key.valid_until ?? compromisedAt,
      retired_at: key.retired_at ?? now,
      rotation_reason: 'compromise',
    })
    .eq('id', key.id)
  if (error) throw error

  // Rotate immediately so the organization can keep issuing.
  if (key.status === 'active') {
    await rotateIssuerKey(organizationId, actingUserId, 'compromise')
  }

  const { data: affected } = await service
    .from('issued_credentials')
    .select('id, subject_user_id, subject_email, label')
    .eq('key_id', keyId)
    .gte('issued_at', compromisedAt)

  const rows = (affected ?? []) as {
    id: string
    subject_user_id: string | null
    subject_email: string
    label: string
  }[]

  for (const credential of rows) {
    if (!credential.subject_user_id) continue
    await createNotification({
      userId: credential.subject_user_id,
      type: 'credential_key_compromised',
      title: 'A credential you hold needs re-checking',
      message: `The signing key behind "${credential.label}" was reported compromised. The credential no longer verifies, and the issuer needs to reissue it.`,
      relatedEntityId: credential.id,
      relatedEntityType: 'issued_credential',
      email: credential.subject_email,
    }).catch(() => undefined)
  }

  await createAuditEntry({
    userId: actingUserId,
    eventType: 'issuer_key_compromised',
    action: `Declared issuer signing key ${keyId} compromised`,
    success: false,
    metadata: {
      organization_id: organizationId,
      key_id: keyId,
      compromised_at: compromisedAt,
      affected_credentials: rows.length,
    },
  })

  return { affectedCredentials: rows.length }
}

export interface KeyLifecycleStatus {
  activeKeyId: string | null
  activeSince: string | null
  ageDays: number | null
  rotationDue: boolean
  retiredKeys: number
  compromisedKeys: number
}

/** Key age and rotation prompt state, surfaced in the organization portal. */
export async function getKeyLifecycleStatus(
  organizationId: string
): Promise<KeyLifecycleStatus> {
  const keys = await listIssuerKeys(organizationId)
  const active = keys.find((key) => key.status === 'active') ?? null
  const ageDays = active
    ? Math.floor((Date.now() - new Date(active.valid_from).getTime()) / (24 * 60 * 60 * 1000))
    : null

  return {
    activeKeyId: active?.key_id ?? null,
    activeSince: active?.valid_from ?? null,
    ageDays,
    rotationDue: ageDays !== null && ageDays >= KEY_ROTATION_PROMPT_DAYS,
    retiredKeys: keys.filter((key) => key.status === 'retired').length,
    compromisedKeys: keys.filter((key) => key.status === 'compromised').length,
  }
}

/**
 * Sign a credential payload with the org's active issuer key. Ensures a key
 * exists, then returns the key id and base64url Ed25519 signature.
 */
export async function signCredentialForOrg(
  organizationId: string,
  payload: unknown
): Promise<{ keyId: string; signature: string }> {
  const key = await getOrCreateActiveIssuerKey(organizationId)
  const signature = signWithPrivateKey(key.encrypted_private_key, key.private_key_iv, payload)
  return { keyId: key.key_id, signature }
}
