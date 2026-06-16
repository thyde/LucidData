import { createServiceClient } from '@/lib/supabase/service'
import { generateIssuerKey, signWithPrivateKey } from '@/lib/crypto/credential-signing'
import type { IssuerKey } from '@/types/database.types'

/** Public (non-secret) view of an issuer's signing key. */
export interface IssuerPublicKey {
  keyId: string
  alg: 'ed25519'
  publicKey: string
}

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
    })
    .select('*')
    .single()
  if (error) throw error
  return data as IssuerKey
}

/** Public key info safe to share with verifiers (no private material). */
export async function getIssuerPublicKey(organizationId: string): Promise<IssuerPublicKey | null> {
  const key = await getActiveIssuerKey(organizationId)
  if (!key) return null
  return { keyId: key.key_id, alg: 'ed25519', publicKey: key.public_key }
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
