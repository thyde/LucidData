/**
 * Network Error Detection Utility
 *
 * Analyzes errors to distinguish between network connectivity issues
 * and authentication/business logic errors, providing user-friendly
 * error messages with actionable troubleshooting steps.
 */

export interface NetworkErrorAnalysis {
  isNetworkError: boolean;
  isConnectionRefused: boolean;
  message: string;
  diagnostics?: string;
}

/**
 * Analyzes an error object to determine if it's a network connectivity issue
 *
 * @param error - Error object from fetch, Supabase, or other network calls
 * @returns Analysis with error type and diagnostic information
 */
export function analyzeError(error: unknown): NetworkErrorAnalysis {
  const errorMsg = (error as Error)?.message || '';

  // Check for fetch network errors
  if (
    errorMsg.includes('Failed to fetch') ||
    errorMsg.includes('ERR_CONNECTION_REFUSED') ||
    errorMsg.includes('NetworkError') ||
    errorMsg.includes('ECONNREFUSED')
  ) {
    return {
      isNetworkError: true,
      isConnectionRefused: true,
      message: 'Cannot connect to authentication service',
      diagnostics: `Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'unknown'}`,
    };
  }

  // Check for timeout errors
  if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    return {
      isNetworkError: true,
      isConnectionRefused: false,
      message: 'Connection timeout',
      diagnostics: 'The server took too long to respond',
    };
  }

  // Not a network error - treat as auth/business logic error
  return {
    isNetworkError: false,
    isConnectionRefused: false,
    message: errorMsg || 'Authentication failed',
  };
}

/**
 * Gets a user-friendly error message for authentication errors
 *
 * Provides specific, actionable error messages:
 * - Network errors: Includes Supabase URL and troubleshooting steps
 * - Auth errors: Returns the original error message from Supabase
 *
 * @param error - Error object from Supabase auth calls
 * @returns User-friendly error message
 */
export function getAuthErrorMessage(error: unknown): string {
  const analysis = analyzeError(error);

  if (analysis.isNetworkError) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `Cannot connect to authentication service at ${url}. Please ensure Supabase is running. Try: npx supabase start`;
  }

  return analysis.message;
}
