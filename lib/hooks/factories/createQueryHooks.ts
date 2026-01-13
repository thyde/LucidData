/**
 * Query Hooks Factory
 *
 * Generic factory for creating React Query hooks with hierarchical query keys.
 * Reduces code duplication across entity-specific hooks (vault, consent, audit).
 *
 * Usage:
 * ```typescript
 * const { useList, useEntry, queryKeys } = createQueryHooks<VaultData>({
 *   entityName: 'vault',
 *   endpoints: {
 *     list: '/api/vault',
 *     detail: (id) => `/api/vault/${id}`,
 *   },
 * });
 * ```
 */

import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

/**
 * Configuration for query hooks factory
 */
export interface QueryHooksConfig<TData, TFilters = void> {
  /** Entity name for query keys (e.g., 'vault', 'consent', 'audit') */
  entityName: string;

  /** API endpoints */
  endpoints: {
    /** List endpoint URL */
    list: string;
    /** Detail endpoint URL generator */
    detail: (id: string) => string;
  };

  /** Optional error messages */
  errorMessages?: {
    listFetch?: string;
    detailFetch?: string;
    detailNotFound?: string;
  };

  /** Optional filter to query params converter */
  filterToParams?: (filters: TFilters) => URLSearchParams;
}

/**
 * Hierarchical query key factory
 *
 * Pattern: ['entity', 'list'] or ['entity', 'detail', id]
 */
export function createQueryKeys<TFilters = void>(entityName: string) {
  return {
    all: [entityName] as const,
    lists: () => [entityName, 'list'] as const,
    list: (filters?: TFilters) =>
      filters ? ([entityName, 'list', filters] as const) : ([entityName, 'list'] as const),
    details: () => [entityName, 'detail'] as const,
    detail: (id: string) => [entityName, 'detail', id] as const,
  };
}

/**
 * Generic list query hook
 */
export function createUseList<TData, TFilters = void>(
  config: QueryHooksConfig<TData, TFilters>
) {
  const queryKeys = createQueryKeys<TFilters>(config.entityName);

  return function useList(
    filters?: TFilters,
    options?: Omit<UseQueryOptions<TData[], Error>, 'queryKey' | 'queryFn'>
  ): UseQueryResult<TData[], Error> {
    return useQuery({
      queryKey: queryKeys.list(filters),
      queryFn: async (): Promise<TData[]> => {
        let url = config.endpoints.list;

        // Apply filters if provided
        if (filters && config.filterToParams) {
          const params = config.filterToParams(filters);
          if (params.toString()) {
            url += `?${params.toString()}`;
          }
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            config.errorMessages?.listFetch || `Failed to fetch ${config.entityName} entries`
          );
        }

        return response.json();
      },
      ...options,
    });
  };
}

/**
 * Generic detail query hook
 */
export function createUseEntry<TData>(config: QueryHooksConfig<TData>) {
  const queryKeys = createQueryKeys(config.entityName);

  return function useEntry(
    id: string,
    options?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn' | 'enabled'>
  ): UseQueryResult<TData, Error> {
    return useQuery({
      queryKey: queryKeys.detail(id),
      queryFn: async (): Promise<TData> => {
        const response = await fetch(config.endpoints.detail(id));

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(
              config.errorMessages?.detailNotFound || `${config.entityName} entry not found`
            );
          }
          throw new Error(
            config.errorMessages?.detailFetch || `Failed to fetch ${config.entityName} entry`
          );
        }

        return response.json();
      },
      enabled: !!id,
      ...options,
    });
  };
}

/**
 * Complete query hooks factory
 *
 * Creates both useList and useEntry hooks with shared query keys.
 *
 * @example
 * ```typescript
 * const vaultHooks = createQueryHooks<DecryptedVaultData>({
 *   entityName: 'vault',
 *   endpoints: {
 *     list: '/api/vault',
 *     detail: (id) => `/api/vault/${id}`,
 *   },
 * });
 *
 * // Usage in components:
 * const { data: entries } = vaultHooks.useList();
 * const { data: entry } = vaultHooks.useEntry(id);
 * ```
 */
export function createQueryHooks<TData, TFilters = void>(
  config: QueryHooksConfig<TData, TFilters>
) {
  const queryKeys = createQueryKeys<TFilters>(config.entityName);
  const useList = createUseList<TData, TFilters>(config);
  const useEntry = createUseEntry<TData>(config);

  return {
    useList,
    useEntry,
    queryKeys,
  };
}
