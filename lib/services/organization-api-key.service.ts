import { createClient } from '@/lib/supabase/server'
import {
  listOrganizationApiKeys,
  type OrganizationApiKeyMetadata,
} from '@/lib/repositories/organization-api-key.repository'
import { generateApiKey } from '@/lib/utils/api-key'

export interface RotatedOrganizationApiKey {
  apiKey: string
  key: OrganizationApiKeyMetadata
}

function toMetadata(
  key: Awaited<ReturnType<typeof rotateOrganizationApiKeyRpc>>
): OrganizationApiKeyMetadata {
  const { key_hash: _keyHash, ...metadata } = key
  void _keyHash
  return metadata
}

async function rotateOrganizationApiKeyRpc(
  organizationId: string,
  name: string,
  keyHash: string,
  keySuffix: string
) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rotate_organization_api_key', {
    p_organization_id: organizationId,
    p_key_hash: keyHash,
    p_key_suffix: keySuffix,
    p_name: name,
  })
  if (error) throw error
  const key = data?.[0]
  if (!key) throw new Error('API key rotation did not return a key')
  return key
}

export async function getOrganizationApiKeys(
  organizationId: string
): Promise<OrganizationApiKeyMetadata[]> {
  return listOrganizationApiKeys(organizationId)
}

export async function rotateOrganizationApiKey(
  organizationId: string,
  name: string
): Promise<RotatedOrganizationApiKey> {
  const generated = generateApiKey()
  const key = await rotateOrganizationApiKeyRpc(
    organizationId,
    name,
    generated.hash,
    generated.key.slice(-6)
  )
  return { apiKey: generated.key, key: toMetadata(key) }
}

export async function revokeOrganizationApiKey(
  keyId: string
): Promise<OrganizationApiKeyMetadata> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('revoke_organization_api_key', {
    p_key_id: keyId,
  })
  if (error) throw error
  const key = data?.[0]
  if (!key) throw new Error('API key revocation did not return a key')
  return toMetadata(key)
}