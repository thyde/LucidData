'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuditLogsAction } from '@/lib/actions/audit.actions'

export function useAuditLogs() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['audit'],
    queryFn: getAuditLogsAction,
    staleTime: 30_000,
  })

  // Realtime subscription — invalidate cache on new audit log
  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel('audit-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'audit_logs',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['audit'] })
          }
        )
        .subscribe()

      return channel
    }

    const channelPromise = getUser()

    return () => {
      channelPromise.then(channel => {
        if (channel) createClient().removeChannel(channel)
      })
    }
  }, [queryClient])

  return query
}

// ---------------------------------------------------------------------------
// Legacy-compatible exports — kept for any existing consumers
// ---------------------------------------------------------------------------

export interface AuditLogsResponse {
  logs: import('@/types/database.types').AuditLog[];
  chainValid: boolean;
  totalLogs?: number;
  brokenAt?: number | null;
}

export interface AuditFilters {
  eventType?: string;
  vaultDataId?: string;
  consentId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * @deprecated Use useAuditLogs() instead. Kept for backward compatibility.
 */
export function useAuditList(filters?: AuditFilters) {
  const result = useAuditLogs()
  if (!filters || !result.data) return result as unknown as ReturnType<typeof useQuery<AuditLogsResponse, Error>>

  // Apply client-side filtering on the returned data
  const filteredData: AuditLogsResponse | undefined = result.data
    ? {
        ...result.data,
        logs: result.data.logs.filter((log) => {
          if (filters.eventType && log.event_type !== filters.eventType) return false
          if (filters.vaultDataId && log.vault_data_id !== filters.vaultDataId) return false
          if (filters.consentId && log.consent_id !== filters.consentId) return false
          if (filters.startDate && new Date(log.timestamp) < filters.startDate) return false
          if (filters.endDate && new Date(log.timestamp) > filters.endDate) return false
          return true
        }),
      }
    : undefined

  return { ...result, data: filteredData } as unknown as ReturnType<typeof useQuery<AuditLogsResponse, Error>>
}

// Convenience aliases
export const AUDIT_KEYS = {
  all: ['audit'] as const,
  lists: () => ['audit', 'list'] as const,
  list: (filters?: AuditFilters) =>
    filters ? (['audit', 'list', filters] as const) : (['audit', 'list'] as const),
  details: () => ['audit', 'detail'] as const,
  detail: (id: string) => ['audit', 'detail', id] as const,
}

export function useVaultAuditHistory(vaultDataId: string) {
  return useAuditList({ vaultDataId })
}

export function useConsentAuditHistory(consentId: string) {
  return useAuditList({ consentId })
}

export function useAuditByEventType(eventType: string) {
  return useAuditList({ eventType })
}

export function useAuditDateRange(startDate: Date, endDate: Date) {
  return useAuditList({ startDate, endDate })
}
