import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database.types'

type OrganizationApiKeyRow =
  Database['public']['Tables']['organization_api_keys']['Row']

export type OrganizationApiKeyMetadata = Omit<OrganizationApiKeyRow, 'key_hash'>

const METADATA_COLUMNS =
  'id, organization_id, name, key_suffix, status, created_at, last_used_at, revoked_at, expires_at' as const

export async function listOrganizationApiKeys(
  organizationId: string
): Promise<OrganizationApiKeyMetadata[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('organization_api_keys')
    .select(METADATA_COLUMNS)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function updateInitialKeySuffix(
  organizationId: string,
  keySuffix: string
): Promise<void> {
  const service = createServiceClient()
  const { error } = await service
    .from('organization_api_keys')
    .update({ key_suffix: keySuffix })
    .eq('organization_id', organizationId)
    .eq('status', 'active')
  if (error) throw error
}