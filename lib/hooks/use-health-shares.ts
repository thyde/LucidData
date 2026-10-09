'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/actions/unwrap'
import {
  createHealthShareAction,
  listHealthSharesAction,
  revokeHealthShareAction,
} from '@/lib/actions/health-share.actions'
import { CONSENT_KEYS } from '@/lib/hooks/useConsent'
import type { CreateHealthShareInput } from '@luciddata/core/validations/health-share'
import type { CreatedHealthShare, HealthShareSummary } from '@/lib/services/health-share.service'

export const HEALTH_SHARE_KEYS = {
  all: ['health-shares'] as const,
}

/** The person's shared summaries, newest first. Views are live, so the list is never served from cache. */
export function useHealthShares(enabled = true) {
  return useQuery<HealthShareSummary[], Error>({
    queryKey: HEALTH_SHARE_KEYS.all,
    queryFn: () => unwrap(listHealthSharesAction()),
    enabled,
    staleTime: 0,
  })
}

export function useCreateHealthShare() {
  const queryClient = useQueryClient()
  return useMutation<CreatedHealthShare, Error, CreateHealthShareInput>({
    mutationFn: (input) => unwrap(createHealthShareAction(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEALTH_SHARE_KEYS.all })
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.all })
    },
  })
}

export function useRevokeHealthShare() {
  const queryClient = useQueryClient()
  return useMutation<HealthShareSummary, Error, string>({
    mutationFn: (shareId) => unwrap(revokeHealthShareAction({ shareId })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEALTH_SHARE_KEYS.all })
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.all })
    },
  })
}
