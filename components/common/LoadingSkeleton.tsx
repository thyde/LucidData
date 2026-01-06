'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface LoadingSkeletonProps {
  count?: number;
  type?: 'card' | 'list' | 'table';
}

/**
 * Loading skeleton component for better perceived performance
 * Shows placeholder content while data is loading
 */
export function LoadingSkeleton({ count = 3, type = 'card' }: LoadingSkeletonProps) {
  if (type === 'list') {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="h-16 bg-muted animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="h-12 bg-muted/50 animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  // Default: card type
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
            <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
