'use client';

import { SerwistProvider } from '@serwist/next/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { EncryptionProvider } from '@/lib/context/encryption-context';
import { Toaster } from '@/components/ui/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === 'development'}
      cacheOnNavigation
      reloadOnOnline
    >
      <QueryClientProvider client={queryClient}>
        <EncryptionProvider>
          {children}
        </EncryptionProvider>
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </SerwistProvider>
  );
}
