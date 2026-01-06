import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';

/**
 * Creates a test-specific QueryClient with proper configuration
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry in tests
        gcTime: 0, // No cache in tests (formerly cacheTime)
        staleTime: 0, // Prevent stale data issues
      },
      mutations: {
        retry: false,
      },
    },
    // Disable logging in tests
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  });
}

/**
 * Custom render function that includes providers for testing
 * Wraps components with QueryClientProvider configured for tests
 * Returns queryClient for test introspection
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & {
    queryClient?: QueryClient; // Allow passing custom client
  }
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient, // Expose for test assertions
  };
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';

// Override default render with our custom version
export { renderWithProviders as render };
