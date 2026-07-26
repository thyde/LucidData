import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

type MockMutationResult = UseMutationResult<any, Error, any, unknown> & {
  mutate: ReturnType<typeof vi.fn>;
  mutateAsync: ReturnType<typeof vi.fn>;
};

type MockQueryResult = UseQueryResult<any, Error> & {
  refetch: ReturnType<typeof vi.fn>;
};

/**
 * Creates a mock mutation function that simulates async React Query behavior
 *
 * @param onSuccessHook - Optional hook-level onSuccess callback (from useMutation)
 * @param onErrorHook - Optional hook-level onError callback (from useMutation)
 */
export function createMockMutation<TData = any, TVariables = any>(options?: {
  onSuccessHook?: (data: TData) => void;
  onErrorHook?: (error: Error) => void;
}) {
  const mockMutate = vi.fn((variables: TVariables, callbackOptions?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
  }) => {
    // Simulate async mutation with setTimeout
    setTimeout(() => {
      const data = variables as unknown as TData;

      act(() => {
        // Call hook-level onSuccess first (like React Query does)
        options?.onSuccessHook?.(data);

        // Then call component-level onSuccess
        callbackOptions?.onSuccess?.(data);
      });
    }, 0);
  });

  const result = {
    mutate: mockMutate,
    mutateAsync: vi.fn(async (variables: TVariables) => variables as unknown as TData),
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    isIdle: true,
    isPending: false,
    isError: false,
    isSuccess: false,
    status: 'idle' as const,
    submittedAt: 0,
    error: null,
    data: undefined,
    reset: vi.fn(),
  };

  return result as MockMutationResult;
}

/**
 * Creates a mock query return value
 */
export function createMockQuery<TData = any>(
  data: TData,
  overrides?: Partial<UseQueryResult<TData, Error>>
) {
  const result = {
    data,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isLoadingError: false,
    isInitialLoading: false,
    isPaused: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    isEnabled: true,
    error: null,
    refetch: vi.fn(async () => undefined),
    status: 'success' as const,
    fetchStatus: 'idle' as const,
    promise: Promise.resolve(data),
    ...overrides,
  };

  return result as MockQueryResult;
}

/**
 * Creates a loading query state
 */
export function createLoadingQuery<TData = any>() {
  return createMockQuery<TData>(undefined as TData, {
    isLoading: true,
    isPending: true,
    isFetched: false,
    isSuccess: false,
    status: 'pending',
    fetchStatus: 'fetching',
  });
}

/**
 * Creates an error query state
 */
export function createErrorQuery<TData = any>(errorMessage = 'Failed to load') {
  return createMockQuery<TData>(undefined as TData, {
    isError: true,
    isSuccess: false,
    error: new Error(errorMessage),
    status: 'error',
  });
}

export function createMockToast(toast = vi.fn()) {
  return {
    toast,
    dismiss: vi.fn(),
    toasts: [],
  };
}
