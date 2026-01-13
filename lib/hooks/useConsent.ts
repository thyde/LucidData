'use client';

import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { Consent } from '@prisma/client';
import { ConsentInput, UpdateConsentInput } from '@/lib/validations/consent';
import { useToast } from '@/lib/hooks/use-toast';
import { createQueryHooks } from './factories/createQueryHooks';
import { createMutationHooks } from './factories/createMutationHooks';

/**
 * React Query hooks for consent operations
 *
 * Refactored to use generic hook factories with specialized hooks
 * for consent-specific operations (revoke).
 */

export interface ConsentFilters {
  vaultDataId?: string;
  active?: boolean;
}

// Helper to convert filters to query params
function filtersToParams(filters: ConsentFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.vaultDataId) {
    params.append('vaultDataId', filters.vaultDataId);
  }
  if (filters.active !== undefined) {
    params.append('active', String(filters.active));
  }
  return params;
}

// Create query hooks using factory
const { useList, useEntry, queryKeys } = createQueryHooks<Consent, ConsentFilters>({
  entityName: 'consent',
  endpoints: {
    list: '/api/consent',
    detail: (id) => `/api/consent/${id}`,
  },
  errorMessages: {
    listFetch: 'Failed to fetch consents',
    detailFetch: 'Failed to fetch consent',
    detailNotFound: 'Consent not found',
  },
  filterToParams: filtersToParams,
});

// Create mutation hooks using factory
const { useCreate, useUpdate } = createMutationHooks<
  Consent,
  ConsentInput,
  UpdateConsentInput
>({
  entityName: 'consent',
  queryKeys,
  endpoints: {
    create: '/api/consent',
    update: (id) => `/api/consent/${id}`,
    delete: (id) => `/api/consent/${id}`, // Not used, but required by interface
  },
  getIdFromData: (data) => data.id,
  toastMessages: {
    createSuccess: 'Consent granted successfully',
    updateSuccess: 'Consent extended successfully',
  },
});

/**
 * Revoke a consent
 *
 * Specialized mutation for revoking consents (requires reason parameter).
 * This doesn't use the factory pattern because of its unique signature.
 */
export function useRevokeConsent(): UseMutationResult<
  Consent,
  Error,
  { id: string; reason: string }
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }): Promise<Consent> => {
      const response = await fetch(`/api/consent/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ revokedReason: reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke consent');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate both the list and the specific entry
      queryClient.invalidateQueries({ queryKey: queryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.detail(data.id) });

      toast({
        title: 'Success',
        description: 'Consent revoked successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to revoke consent',
      });
    },
  });
}

// Export query keys for external use
export const CONSENT_KEYS = queryKeys;

// Export hooks with original names for backward compatibility
export const useConsentList = useList;
export const useConsentEntry = useEntry;
export const useCreateConsent = useCreate;
export const useExtendConsent = useUpdate;
