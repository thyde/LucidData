import { vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';

/**
 * Flushes all pending promises in the microtask queue
 */
export async function flushPromises() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Waits for a mutation callback to complete
 * Use after triggering mutations that have onSuccess/onError
 */
export async function waitForMutation() {
  await flushPromises();
  await vi.waitFor(() => {}, { timeout: 100 });
}

/**
 * Waits for React Query cache invalidation to complete
 */
export async function waitForInvalidation(queryClient: QueryClient) {
  await flushPromises();
  // Allow cache to process updates
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Waits for toast to be called
 */
export async function waitForToast(mockToast: any) {
  await vi.waitFor(() => {
    expect(mockToast).toHaveBeenCalled();
  }, { timeout: 500 });
}
