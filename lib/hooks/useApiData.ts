'use client';

import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

export interface UseApiDataOptions {
  enabled?: boolean; // Whether to fetch immediately
  refetchInterval?: number; // Auto-refetch interval in ms
}

export interface UseApiDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch data from API endpoints
 * Replaces duplicate fetch patterns across dashboard pages
 *
 * @param endpoint - API endpoint to fetch from
 * @param options - Configuration options
 * @returns Object with data, loading state, error, and refetch function
 *
 * @example
 * const { data, loading, error, refetch } = useApiData<VaultData[]>('/api/vault');
 */
export function useApiData<T>(
  endpoint: string,
  options: UseApiDataOptions = {}
): UseApiDataReturn<T> {
  const { enabled = true, refetchInterval } = options;

  const query = useQuery<T, Error>({
    queryKey: ['api-data', endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    },
    enabled,
    refetchInterval: enabled ? refetchInterval : false,
  });

  return {
    data: query.data ?? null,
    loading: query.isFetching,
    error: query.error?.message ?? null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for mutating data (POST, PATCH, DELETE)
 *
 * @example
 * const { mutate, loading, error } = useApiMutation<VaultData>('/api/vault');
 * await mutate({ method: 'POST', body: { label: 'My Data' } });
 */
export function useApiMutation<T>(endpoint: string) {
  type MutationOptions = {
    method: 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  };

  const mutation = useMutation<T, Error, MutationOptions>({
    mutationFn: async (options) => {
      const response = await fetch(endpoint, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    },
  });

  const mutate = useCallback(
    async (options: MutationOptions): Promise<T | null> => {
      try {
        return await mutation.mutateAsync(options);
      } catch (err) {
        console.error('API mutation error:', err);
        return null;
      }
    },
    [mutation]
  );

  return {
    mutate,
    loading: mutation.isPending,
    error: mutation.error?.message ?? null,
    data: mutation.data ?? null,
  };
}
