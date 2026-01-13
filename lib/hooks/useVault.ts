'use client';

import { DecryptedVaultData } from '@/types';
import { VaultDataInput } from '@/lib/validations/vault';
import { createQueryHooks } from './factories/createQueryHooks';
import { createMutationHooks } from './factories/createMutationHooks';

/**
 * React Query hooks for vault operations
 *
 * Refactored to use generic hook factories for reduced duplication.
 */

// Create query hooks using factory
const { useList, useEntry, queryKeys } = createQueryHooks<DecryptedVaultData>({
  entityName: 'vault',
  endpoints: {
    list: '/api/vault',
    detail: (id) => `/api/vault/${id}`,
  },
  errorMessages: {
    listFetch: 'Failed to fetch vault entries',
    detailFetch: 'Failed to fetch vault entry',
    detailNotFound: 'Vault entry not found',
  },
});

// Create mutation hooks using factory
const { useCreate, useUpdate, useDelete } = createMutationHooks<
  DecryptedVaultData,
  VaultDataInput,
  Partial<VaultDataInput>
>({
  entityName: 'vault',
  queryKeys,
  endpoints: {
    create: '/api/vault',
    update: (id) => `/api/vault/${id}`,
    delete: (id) => `/api/vault/${id}`,
  },
  getIdFromData: (data) => data.id,
  toastMessages: {
    createSuccess: 'Vault entry created successfully',
    updateSuccess: 'Vault entry updated successfully',
    deleteSuccess: 'Vault entry deleted successfully',
  },
});

// Export query keys for external use
export const VAULT_KEYS = queryKeys;

// Export hooks with original names for backward compatibility
export const useVaultList = useList;
export const useVaultEntry = useEntry;
export const useCreateVault = useCreate;
export const useUpdateVault = useUpdate;
export const useDeleteVault = useDelete;
