'use client';

import { useQuery, useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { Consent } from '@/types/database.types';
import { useToast } from '@/lib/hooks/use-toast';
import { getConsentsAction, getConsentAction, createConsentAction, revokeConsentAction, extendConsentAction } from '@/lib/actions/consent.actions';

/**
 * React Query hooks for consent operations
 *
 * Uses Server Actions directly instead of REST API routes.
 */

export interface ConsentFilters {
  vaultDataId?: string;
  active?: boolean;
}

// Query keys
export const CONSENT_KEYS = {
  all: ['consent'] as const,
  lists: () => ['consent', 'list'] as const,
  list: (filters?: ConsentFilters) =>
    filters ? (['consent', 'list', filters] as const) : (['consent', 'list'] as const),
  details: () => ['consent', 'detail'] as const,
  detail: (id: string) => ['consent', 'detail', id] as const,
};

export function useConsentList(filters?: ConsentFilters) {
  return useQuery<Consent[], Error>({
    queryKey: CONSENT_KEYS.list(filters),
    queryFn: async () => {
      const consents = await getConsentsAction();
      // Apply client-side filtering if filters provided
      if (!filters) return consents;
      return consents.filter((c) => {
        if (filters.vaultDataId && c.vault_data_id !== filters.vaultDataId) return false;
        if (filters.active !== undefined) {
          const isActive = !c.revoked && (!c.end_date || new Date(c.end_date) >= new Date());
          if (filters.active !== isActive) return false;
        }
        return true;
      });
    },
  });
}

export function useConsentEntry(id: string) {
  return useQuery<Consent, Error>({
    queryKey: CONSENT_KEYS.detail(id),
    queryFn: async () => {
      const consent = await getConsentAction(id);
      if (!consent) throw new Error('Consent not found');
      return consent;
    },
    enabled: !!id,
  });
}

export function useCreateConsent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<Consent, Error, Parameters<typeof createConsentAction>[0]>({
    mutationFn: (payload) => createConsentAction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.lists() });
      toast({ title: 'Success', description: 'Consent granted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to create consent' });
    },
  });
}

export function useExtendConsent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<Consent, Error, { id: string; data: { endDate?: Date } }>({
    mutationFn: async ({ id, data }) => {
      const newEndDate = data.endDate?.toISOString() ?? '';
      return extendConsentAction(id, newEndDate);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.detail(data.id) });
      toast({ title: 'Success', description: 'Consent extended successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to extend consent' });
    },
  });
}

/**
 * Revoke a consent
 *
 * Specialized mutation for revoking consents (requires reason parameter).
 */
export function useRevokeConsent(): UseMutationResult<
  Consent,
  Error,
  { id: string; reason: string }
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }): Promise<Consent> => {
      return revokeConsentAction(id, reason);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.detail(data.id) });
      toast({ title: 'Success', description: 'Consent revoked successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to revoke consent' });
    },
  });
}
