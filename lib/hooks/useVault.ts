'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DecryptedVaultData } from '@/types';
import { VaultDataInput } from '@/lib/validations/vault';
import { useToast } from '@/lib/hooks/use-toast';

/**
 * React Query hooks for vault operations
 */

// Query keys
const VAULT_KEYS = {
  all: ['vault'] as const,
  lists: () => [...VAULT_KEYS.all, 'list'] as const,
  list: () => [...VAULT_KEYS.lists()] as const,
  details: () => [...VAULT_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...VAULT_KEYS.details(), id] as const,
};

/**
 * Fetch all vault entries
 */
export function useVaultList() {
  return useQuery({
    queryKey: VAULT_KEYS.list(),
    queryFn: async (): Promise<DecryptedVaultData[]> => {
      const response = await fetch('/api/vault');
      if (!response.ok) {
        throw new Error('Failed to fetch vault entries');
      }
      return response.json();
    },
  });
}

/**
 * Fetch a single vault entry by ID
 */
export function useVaultEntry(id: string) {
  return useQuery({
    queryKey: VAULT_KEYS.detail(id),
    queryFn: async (): Promise<DecryptedVaultData> => {
      const response = await fetch(`/api/vault/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Vault entry not found');
        }
        throw new Error('Failed to fetch vault entry');
      }
      return response.json();
    },
    enabled: !!id,
  });
}

/**
 * Create a new vault entry
 */
export function useCreateVault() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: VaultDataInput): Promise<DecryptedVaultData> => {
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create vault entry');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch vault list
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.list() });

      toast({
        title: 'Success',
        description: 'Vault entry created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create vault entry',
      });
    },
  });
}

/**
 * Update an existing vault entry
 */
export function useUpdateVault() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<VaultDataInput>;
    }): Promise<DecryptedVaultData> => {
      const response = await fetch(`/api/vault/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update vault entry');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate both the list and the specific entry
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.list() });
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.detail(data.id) });

      toast({
        title: 'Success',
        description: 'Vault entry updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update vault entry',
      });
    },
  });
}

/**
 * Delete a vault entry
 */
export function useDeleteVault() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`/api/vault/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete vault entry');
      }
    },
    onSuccess: () => {
      // Invalidate vault list
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.list() });

      toast({
        title: 'Success',
        description: 'Vault entry deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete vault entry',
      });
    },
  });
}
