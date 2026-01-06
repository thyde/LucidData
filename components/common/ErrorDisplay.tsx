'use client';

import { AlertCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  error: string | Error;
  title?: string;
  variant?: 'error' | 'warning' | 'info';
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * User-friendly error display component
 * Shows errors in a consistent, accessible format
 */
export function ErrorDisplay({
  error,
  title,
  variant = 'error',
  onRetry,
  onDismiss,
  className = '',
}: ErrorDisplayProps) {
  const errorMessage = error instanceof Error ? error.message : error;

  const config = {
    error: {
      icon: XCircle,
      iconClass: 'text-destructive',
      borderClass: 'border-destructive',
      title: title || 'Error',
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'text-warning',
      borderClass: 'border-warning',
      title: title || 'Warning',
    },
    info: {
      icon: Info,
      iconClass: 'text-info',
      borderClass: 'border-info',
      title: title || 'Information',
    },
  };

  const { icon: Icon, iconClass, borderClass, title: defaultTitle } = config[variant];

  return (
    <Card className={`${borderClass} ${className}`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Icon className={`h-5 w-5 ${iconClass} flex-shrink-0 mt-0.5`} />
          <div className="flex-1 space-y-2">
            <h3 className="font-medium text-sm">{defaultTitle}</h3>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>

            {(onRetry || onDismiss) && (
              <div className="flex gap-2 pt-2">
                {onRetry && (
                  <Button onClick={onRetry} variant="outline" size="sm">
                    Try Again
                  </Button>
                )}
                {onDismiss && (
                  <Button onClick={onDismiss} variant="ghost" size="sm">
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Inline error message (smaller, for forms)
 */
export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}
