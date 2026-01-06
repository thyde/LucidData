'use client';

import { useState, useEffect, useCallback } from 'react';

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

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(endpoint);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
      console.error('API fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refetch interval
  useEffect(() => {
    if (!refetchInterval || !enabled) return;

    const intervalId = setInterval(fetchData, refetchInterval);
    return () => clearInterval(intervalId);
  }, [refetchInterval, enabled, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const mutate = useCallback(
    async (options: {
      method: 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
    }): Promise<T | null> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(endpoint, {
          method: options.method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const result = await response.json();
        setData(result);
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to mutate data';
        setError(errorMessage);
        console.error('API mutation error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  return {
    mutate,
    loading,
    error,
    data,
  };
}
