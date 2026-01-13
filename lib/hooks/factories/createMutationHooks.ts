/**
 * Mutation Hooks Factory
 *
 * Generic factory for creating React Query mutation hooks with automatic
 * cache invalidation and toast notifications.
 *
 * Usage:
 * ```typescript
 * const { useCreate, useUpdate, useDelete } = createMutationHooks<VaultData, VaultDataInput>({
 *   entityName: 'vault',
 *   queryKeys: vaultQueryKeys,
 *   endpoints: {
 *     create: '/api/vault',
 *     update: (id) => `/api/vault/${id}`,
 *     delete: (id) => `/api/vault/${id}`,
 *   },
 * });
 * ```
 */

import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { useToast } from '@/lib/hooks/use-toast';

/**
 * Query key structure (matches createQueryKeys pattern)
 */
export interface QueryKeys {
  all: readonly string[];
  lists: () => readonly string[];
  list: (filters?: any) => readonly string[];
  details: () => readonly string[];
  detail: (id: string) => readonly string[];
}

/**
 * Configuration for mutation hooks factory
 */
export interface MutationHooksConfig<TData, TCreateInput, TUpdateInput = Partial<TCreateInput>> {
  /** Entity name for toast messages */
  entityName: string;

  /** Query keys for cache invalidation */
  queryKeys: QueryKeys;

  /** API endpoints */
  endpoints: {
    create: string;
    update: (id: string) => string;
    delete: (id: string) => string;
  };

  /** HTTP methods (defaults: POST, PATCH, DELETE) */
  methods?: {
    create?: string;
    update?: string;
    delete?: string;
  };

  /** Toast messages */
  toastMessages?: {
    createSuccess?: string;
    createError?: string;
    updateSuccess?: string;
    updateError?: string;
    deleteSuccess?: string;
    deleteError?: string;
  };

  /** Extract ID from data (for cache invalidation) */
  getIdFromData?: (data: TData) => string;
}

/**
 * Generic create mutation hook
 */
export function createUseCreate<TData, TCreateInput>(
  config: MutationHooksConfig<TData, TCreateInput>
) {
  return function useCreate(): UseMutationResult<TData, Error, TCreateInput> {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (data: TCreateInput): Promise<TData> => {
        const response = await fetch(config.endpoints.create, {
          method: config.methods?.create || 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `Failed to create ${config.entityName}`);
        }

        return response.json();
      },
      onSuccess: () => {
        // Invalidate all list queries
        queryClient.invalidateQueries({ queryKey: config.queryKeys.lists() });

        toast({
          title: 'Success',
          description:
            config.toastMessages?.createSuccess ||
            `${config.entityName} created successfully`,
        });
      },
      onError: (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description:
            config.toastMessages?.createError ||
            error.message ||
            `Failed to create ${config.entityName}`,
        });
      },
    });
  };
}

/**
 * Generic update mutation hook
 */
export function createUseUpdate<TData, TCreateInput, TUpdateInput = Partial<TCreateInput>>(
  config: MutationHooksConfig<TData, TCreateInput, TUpdateInput>
) {
  return function useUpdate(): UseMutationResult<
    TData,
    Error,
    { id: string; data: TUpdateInput }
  > {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, data }: { id: string; data: TUpdateInput }): Promise<TData> => {
        const response = await fetch(config.endpoints.update(id), {
          method: config.methods?.update || 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `Failed to update ${config.entityName}`);
        }

        return response.json();
      },
      onSuccess: (data) => {
        // Invalidate list queries
        queryClient.invalidateQueries({ queryKey: config.queryKeys.lists() });

        // Invalidate specific entry
        if (config.getIdFromData) {
          const id = config.getIdFromData(data);
          queryClient.invalidateQueries({ queryKey: config.queryKeys.detail(id) });
        }

        toast({
          title: 'Success',
          description:
            config.toastMessages?.updateSuccess ||
            `${config.entityName} updated successfully`,
        });
      },
      onError: (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description:
            config.toastMessages?.updateError ||
            error.message ||
            `Failed to update ${config.entityName}`,
        });
      },
    });
  };
}

/**
 * Generic delete mutation hook
 */
export function createUseDelete<TData, TCreateInput>(
  config: MutationHooksConfig<TData, TCreateInput>
) {
  return function useDelete(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (id: string): Promise<void> => {
        const response = await fetch(config.endpoints.delete(id), {
          method: config.methods?.delete || 'DELETE',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `Failed to delete ${config.entityName}`);
        }
      },
      onSuccess: () => {
        // Invalidate list queries
        queryClient.invalidateQueries({ queryKey: config.queryKeys.lists() });

        toast({
          title: 'Success',
          description:
            config.toastMessages?.deleteSuccess ||
            `${config.entityName} deleted successfully`,
        });
      },
      onError: (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description:
            config.toastMessages?.deleteError ||
            error.message ||
            `Failed to delete ${config.entityName}`,
        });
      },
    });
  };
}

/**
 * Complete mutation hooks factory
 *
 * Creates useCreate, useUpdate, and useDelete hooks with automatic
 * cache invalidation and toast notifications.
 *
 * @example
 * ```typescript
 * const vaultMutations = createMutationHooks<DecryptedVaultData, VaultDataInput>({
 *   entityName: 'vault',
 *   queryKeys: vaultQueryKeys,
 *   endpoints: {
 *     create: '/api/vault',
 *     update: (id) => `/api/vault/${id}`,
 *     delete: (id) => `/api/vault/${id}`,
 *   },
 *   getIdFromData: (data) => data.id,
 * });
 *
 * // Usage in components:
 * const createMutation = vaultMutations.useCreate();
 * const updateMutation = vaultMutations.useUpdate();
 * const deleteMutation = vaultMutations.useDelete();
 * ```
 */
export function createMutationHooks<
  TData,
  TCreateInput,
  TUpdateInput = Partial<TCreateInput>,
>(config: MutationHooksConfig<TData, TCreateInput, TUpdateInput>) {
  const useCreate = createUseCreate<TData, TCreateInput>(config);
  const useUpdate = createUseUpdate<TData, TCreateInput, TUpdateInput>(config);
  const useDelete = createUseDelete<TData, TCreateInput>(config);

  return {
    useCreate,
    useUpdate,
    useDelete,
  };
}
