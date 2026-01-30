import { vi } from 'vitest';
import { act } from '@testing-library/react';

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

  return {
    mutate: mockMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  };
}

/**
 * Creates a mock query return value
 */
export function createMockQuery<TData = any>(
  data: TData,
  overrides?: Partial<{
    isLoading: boolean;
    isError: boolean;
    isFetching: boolean;
    isSuccess: boolean;
    error: Error | null;
    refetch: ReturnType<typeof vi.fn>;
  }>
) {
  return {
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a loading query state
 */
export function createLoadingQuery() {
  return createMockQuery(undefined, {
    isLoading: true,
    isSuccess: false,
  });
}

/**
 * Creates an error query state
 */
export function createErrorQuery(errorMessage = 'Failed to load') {
  return createMockQuery(undefined, {
    isError: true,
    isSuccess: false,
    error: new Error(errorMessage),
  });
}
