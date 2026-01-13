'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { AuditLog } from '@prisma/client';
import { createQueryKeys } from './factories/createQueryHooks';

/**
 * React Query hooks for audit log operations
 *
 * NOTE: Audit logs are read-only from the client perspective.
 * Creation happens automatically through auditService in API routes.
 */

// Query keys
export const AUDIT_KEYS = createQueryKeys('audit');

/**
 * Audit logs response with chain verification
 */
export interface AuditLogsResponse {
  logs: AuditLog[];
  chainValid: boolean;
  totalLogs: number;
  brokenAt?: number | null;
}

/**
 * Filters for audit log queries
 */
export interface AuditFilters {
  eventType?: string;
  vaultDataId?: string;
  consentId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Fetch all audit logs for the current user with chain verification
 *
 * The API automatically:
 * - Retrieves all audit logs for the authenticated user
 * - Verifies the hash chain integrity
 * - Creates an audit log for accessing audit logs
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useAuditList();
 * if (data && !data.chainValid) {
 *   // Alert user to potential tampering
 * }
 * ```
 */
export function useAuditList(
  filters?: AuditFilters
): UseQueryResult<AuditLogsResponse, Error> {
  return useQuery({
    queryKey: AUDIT_KEYS.list(filters),
    queryFn: async (): Promise<AuditLogsResponse> => {
      let url = '/api/audit';

      // Apply filters if provided
      if (filters) {
        const params = new URLSearchParams();

        if (filters.eventType) {
          params.append('eventType', filters.eventType);
        }
        if (filters.vaultDataId) {
          params.append('vaultDataId', filters.vaultDataId);
        }
        if (filters.consentId) {
          params.append('consentId', filters.consentId);
        }
        if (filters.startDate) {
          params.append('startDate', filters.startDate.toISOString());
        }
        if (filters.endDate) {
          params.append('endDate', filters.endDate.toISOString());
        }

        if (params.toString()) {
          url += `?${params.toString()}`;
        }
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      return response.json();
    },
    // Audit logs are critical - don't cache too aggressively
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Verify the hash chain integrity for the current user
 *
 * This is a lightweight check that only verifies the chain without
 * fetching all logs.
 *
 * @example
 * ```tsx
 * const { data: verification } = useAuditVerification();
 * if (verification && !verification.valid) {
 *   showSecurityWarning();
 * }
 * ```
 */
export function useAuditVerification(): UseQueryResult<
  { valid: boolean; brokenAt?: number | null },
  Error
> {
  return useQuery({
    queryKey: [...AUDIT_KEYS.all, 'verification'] as const,
    queryFn: async (): Promise<{ valid: boolean; brokenAt?: number | null }> => {
      const response = await fetch('/api/audit/verify');

      if (!response.ok) {
        throw new Error('Failed to verify audit chain');
      }

      return response.json();
    },
    // Run verification regularly
    refetchInterval: 1000 * 60 * 5, // 5 minutes
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Fetch audit logs for a specific vault entry
 *
 * @param vaultDataId - Vault entry ID
 *
 * @example
 * ```tsx
 * const { data: auditLogs } = useVaultAuditHistory(vaultId);
 * ```
 */
export function useVaultAuditHistory(
  vaultDataId: string
): UseQueryResult<AuditLogsResponse, Error> {
  return useAuditList({ vaultDataId });
}

/**
 * Fetch audit logs for a specific consent
 *
 * @param consentId - Consent ID
 *
 * @example
 * ```tsx
 * const { data: auditLogs } = useConsentAuditHistory(consentId);
 * ```
 */
export function useConsentAuditHistory(
  consentId: string
): UseQueryResult<AuditLogsResponse, Error> {
  return useAuditList({ consentId });
}

/**
 * Fetch audit logs by event type
 *
 * @param eventType - Event type to filter by (e.g., 'data_created', 'consent_granted')
 *
 * @example
 * ```tsx
 * const { data: loginLogs } = useAuditByEventType('user_login');
 * ```
 */
export function useAuditByEventType(
  eventType: string
): UseQueryResult<AuditLogsResponse, Error> {
  return useAuditList({ eventType });
}

/**
 * Fetch audit logs within a date range
 *
 * @param startDate - Start of date range
 * @param endDate - End of date range
 *
 * @example
 * ```tsx
 * const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
 * const { data: recentLogs } = useAuditDateRange(lastWeek, new Date());
 * ```
 */
export function useAuditDateRange(
  startDate: Date,
  endDate: Date
): UseQueryResult<AuditLogsResponse, Error> {
  return useAuditList({ startDate, endDate });
}
