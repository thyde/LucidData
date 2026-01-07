'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Consent } from '@prisma/client';
import { ConsentInput, RevokeConsentInput, UpdateConsentInput } from '@/lib/validations/consent';
import { useToast } from '@/lib/hooks/use-toast';

/**
 * React Query hooks for consent operations
 */

// Query keys
const CONSENT_KEYS = {
  all: ['consent'] as const,
  lists: () => [...CONSENT_KEYS.all, 'list'] as const,
  list: (filters?: { vaultDataId?: string; active?: boolean }) =>
    [...CONSENT_KEYS.lists(), filters] as const,
  details: () => [...CONSENT_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...CONSENT_KEYS.details(), id] as const,
};

export interface ConsentFilters {
  vaultDataId?: string;
  active?: boolean;
}

/**
 * Fetch all consents with optional filters
 */
export function useConsentList(filters?: ConsentFilters) {
  return useQuery({
    queryKey: CONSENT_KEYS.list(filters),
    queryFn: async (): Promise<Consent[]> => {
      const params = new URLSearchParams();
      if (filters?.vaultDataId) {
        params.append('vaultDataId', filters.vaultDataId);
      }
      if (filters?.active !== undefined) {
        params.append('active', String(filters.active));
      }

      const url = `/api/consent${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch consents');
      }
      return response.json();
    },
  });
}

/**
 * Fetch a single consent by ID
 */
export function useConsentEntry(id: string) {
  return useQuery({
    queryKey: CONSENT_KEYS.detail(id),
    queryFn: async (): Promise<Consent> => {
      const response = await fetch(`/api/consent/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Consent not found');
        }
        throw new Error('Failed to fetch consent');
      }
      return response.json();
    },
    enabled: !!id,
  });
}

/**
 * Create a new consent
 */
export function useCreateConsent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ConsentInput): Promise<Consent> => {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create consent');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all consent lists
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.lists() });

      toast({
        title: 'Success',
        description: 'Consent granted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create consent',
      });
    },
  });
}

/**
 * Extend an existing consent (update endDate)
 */
export function useExtendConsent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateConsentInput;
    }): Promise<Consent> => {
      const response = await fetch(`/api/consent/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extend consent');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate both the list and the specific entry
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.detail(data.id) });

      toast({
        title: 'Success',
        description: 'Consent extended successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to extend consent',
      });
    },
  });
}

/**
 * Revoke a consent
 */
export function useRevokeConsent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }): Promise<Consent> => {
      const response = await fetch(`/api/consent/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ revokedReason: reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke consent');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate both the list and the specific entry
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: CONSENT_KEYS.detail(data.id) });

      toast({
        title: 'Success',
        description: 'Consent revoked successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to revoke consent',
      });
    },
  });
}
