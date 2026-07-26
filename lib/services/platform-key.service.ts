import { createServiceClient } from '@/lib/supabase/service'
import { generateIssuerKey } from '@/lib/crypto/credential-signing'
import type { PlatformKey } from '@/types/database.types'

/**
 * Platform-held Ed25519 signing keys, one active key per purpose.
 *
 * Same custody model as issuer keys: the private half is AES-256-GCM-wrapped at
 * rest with ISSUER_KEY_SECRET and only ever decrypted in memory while signing.
 * Reads go through the service role; the table has RLS on with no policy.
 */
export type PlatformKeyPurpose = 'consent_receipt'

export interface PlatformPublicKey {
  keyId: string
  alg: 'ed25519'
  publicKey: string
}

export async function getActivePlatformKey(
  purpose: PlatformKeyPurpose
): Promise<PlatformKey | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('platform_keys')
    .select('*')
    .eq('purpose', purpose)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return (data as PlatformKey | null) ?? null
}

/**
 * The active key for a purpose, generating one on first use. A concurrent
 * create loses on the unique partial index and re-reads the winner, so two
 * simultaneous first signatures still agree on one key.
 */
export async function getOrCreateActivePlatformKey(
  purpose: PlatformKeyPurpose
): Promise<PlatformKey> {
  const existing = await getActivePlatformKey(purpose)
  if (existing) return existing

  const generated = generateIssuerKey()
  const service = createServiceClient()
  const { data, error } = await service
    .from('platform_keys')
    .insert({
      purpose,
      key_id: generated.keyId,
      alg: 'ed25519',
      public_key: generated.publicKey,
      encrypted_private_key: generated.encryptedPrivateKey,
      private_key_iv: generated.privateKeyIv,
    })
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const winner = await getActivePlatformKey(purpose)
      if (winner) return winner
    }
    throw error
  }
  return data as PlatformKey
}

/** Public key material safe to publish, for offline receipt verification. */
export async function getPlatformPublicKey(
  purpose: PlatformKeyPurpose
): Promise<PlatformPublicKey | null> {
  const key = await getActivePlatformKey(purpose)
  if (!key) return null
  return { keyId: key.key_id, alg: 'ed25519', publicKey: key.public_key }
}

/** Resolve a specific key by its id, so receipts signed by a retired key still verify. */
export async function getPlatformKeyById(keyId: string): Promise<PlatformKey | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('platform_keys')
    .select('*')
    .eq('key_id', keyId)
    .maybeSingle()
  if (error) throw error
  return (data as PlatformKey | null) ?? null
}
