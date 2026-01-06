'use client';

import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';

interface DataFetchWrapperProps<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  children: (data: T) => ReactNode;
  emptyMessage?: string;
  loadingMessage?: string;
}

/**
 * Reusable wrapper component for data fetching states
 * Handles loading, error, and empty states consistently across the app
 *
 * @example
 * <DataFetchWrapper
 *   data={vaultEntries}
 *   loading={loading}
 *   error={error}
 *   emptyMessage="No vault entries yet"
 * >
 *   {(entries) => <VaultList entries={entries} />}
 * </DataFetchWrapper>
 */
export function DataFetchWrapper<T>({
  data,
  loading,
  error,
  children,
  emptyMessage = 'No data available',
  loadingMessage = 'Loading...',
}: DataFetchWrapperProps<T>) {
  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">{loadingMessage}</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-8 w-8 text-destructive mb-4" />
          <p className="text-sm font-medium text-destructive mb-2">Error loading data</p>
          <p className="text-xs text-muted-foreground text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  // Success state - render children with data
  return <>{children(data)}</>;
}
