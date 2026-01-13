/**
 * Centralized error logging service
 * Replaces scattered console.error calls with structured logging
 * Can be extended to integrate with external services like Sentry
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  userId?: string;
  action?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

class ErrorLogger {
  /**
   * Log an error with context
   */
  log(
    error: Error | unknown,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext
  ): void {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const logEntry = {
      timestamp,
      severity,
      message: errorMessage,
      stack: errorStack,
      ...context,
    };

    // In development, log to console
    if (process.env.NODE_ENV === 'development') {
      if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
        console.error('[ERROR]', logEntry);
      } else {
        console.warn('[WARNING]', logEntry);
      }
    }

    // In production, send to external service (e.g., Sentry, DataDog)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Integrate with Sentry or similar service
      // Sentry.captureException(error, { contexts: { custom: context } });
    }
  }

  /**
   * Log a security-related error
   */
  security(error: Error | unknown, context?: ErrorContext): void {
    this.log(error, ErrorSeverity.CRITICAL, {
      ...context,
      action: 'SECURITY_EVENT',
    });

    // Security events might trigger alerts
    if (process.env.NODE_ENV === 'production') {
      // TODO: Trigger security alert
    }
  }

  /**
   * Log encryption/decryption errors
   */
  crypto(error: Error | unknown, context?: ErrorContext): void {
    this.log(error, ErrorSeverity.HIGH, {
      ...context,
      action: 'CRYPTO_ERROR',
    });
  }

  /**
   * Log audit log integrity errors
   */
  auditIntegrity(error: Error | unknown, context?: ErrorContext): void {
    this.log(error, ErrorSeverity.CRITICAL, {
      ...context,
      action: 'AUDIT_INTEGRITY_FAILURE',
    });

    // Audit integrity failures are critical security events
    if (process.env.NODE_ENV === 'production') {
      // TODO: Trigger immediate security alert
    }
  }

  /**
   * Log database errors
   */
  database(error: Error | unknown, context?: ErrorContext): void {
    this.log(error, ErrorSeverity.HIGH, {
      ...context,
      action: 'DATABASE_ERROR',
    });
  }

  /**
   * Log API errors with request context
   */
  api(
    error: Error | unknown,
    request: {
      method: string;
      url: string;
      userId?: string;
    },
    context?: ErrorContext
  ): void {
    this.log(error, ErrorSeverity.MEDIUM, {
      ...context,
      action: 'API_ERROR',
      metadata: {
        method: request.method,
        url: request.url,
        userId: request.userId,
        ...context?.metadata,
      },
    });
  }
}

// Export singleton instance
export const errorLogger = new ErrorLogger();

// Export convenience functions
export const logError = (error: Error | unknown, context?: ErrorContext) =>
  errorLogger.log(error, ErrorSeverity.MEDIUM, context);

export const logSecurityError = (error: Error | unknown, context?: ErrorContext) =>
  errorLogger.security(error, context);

export const logCryptoError = (error: Error | unknown, context?: ErrorContext) =>
  errorLogger.crypto(error, context);

export const logAuditIntegrityError = (error: Error | unknown, context?: ErrorContext) =>
  errorLogger.auditIntegrity(error, context);

export const logDatabaseError = (error: Error | unknown, context?: ErrorContext) =>
  errorLogger.database(error, context);

export const logInfo = (message: string, context?: ErrorContext) => {
  if (process.env.NODE_ENV === 'development') {
    console.info('[INFO]', {
      timestamp: new Date().toISOString(),
      message,
      ...context,
    });
  }
};
