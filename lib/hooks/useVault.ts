'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEncryption } from '@/lib/context/encryption-context';
import { useToast } from '@/lib/hooks/use-toast';
import { getVaultEntriesAction, getVaultEntryAction, createVaultEntryAction, updateVaultEntryAction, deleteVaultEntryAction } from '@/lib/actions/vault.actions';
import type { DecryptedVaultData } from '@/types';
import type { VaultData } from '@/types/database.types';

/**
 * React Query hooks for vault operations with client-side encryption.
 *
 * All encryption/decryption is performed in the browser using the master key
 * held in EncryptionContext. Queries are disabled while the vault is locked.
 */

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const VAULT_KEYS = {
  all: ['vault'] as const,
  lists: () => ['vault', 'list'] as const,
  list: () => ['vault', 'list'] as const,
  details: () => ['vault', 'detail'] as const,
  detail: (id: string) => ['vault', 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function decryptEntry(
  entry: VaultData,
  decrypt: (c: string, d: string, s: string) => Promise<string>
): Promise<DecryptedVaultData> {
  try {
    const plaintext = await decrypt(
      entry.client_ciphertext,
      entry.encrypted_dek,
      entry.dek_salt
    );
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    // Strip encrypted fields, add plaintext data
    const { client_ciphertext: _c, encrypted_dek: _d, dek_salt: _s, ...rest } = entry;
    void _c; void _d; void _s;
    return { ...rest, data: parsed };
  } catch {
    const { client_ciphertext: _c, encrypted_dek: _d, dek_salt: _s, ...rest } = entry;
    void _c; void _d; void _s;
    return { ...rest, data: null, decryptionError: 'Failed to decrypt entry' };
  }
}

// ---------------------------------------------------------------------------
// useVaultList
// ---------------------------------------------------------------------------

export function useVaultList() {
  const { isLocked, decrypt } = useEncryption();

  return useQuery<DecryptedVaultData[], Error>({
    queryKey: VAULT_KEYS.list(),
    queryFn: async () => {
      const entries = await getVaultEntriesAction();
      return Promise.all(entries.map((entry) => decryptEntry(entry, decrypt)));
    },
    enabled: !isLocked,
  });
}

// ---------------------------------------------------------------------------
// useVaultEntry
// ---------------------------------------------------------------------------

export function useVaultEntry(id: string) {
  const { isLocked, decrypt } = useEncryption();

  return useQuery<DecryptedVaultData, Error>({
    queryKey: VAULT_KEYS.detail(id),
    queryFn: async () => {
      const entry = await getVaultEntryAction(id);
      if (!entry) throw new Error('Vault entry not found');
      return decryptEntry(entry, decrypt);
    },
    enabled: !!id && !isLocked,
  });
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface CreateVaultPayload {
  label: string;
  category?: string;
  description?: string;
  tags?: string[];
  dataType?: string;
  schemaType?: string;
  schemaVersion?: string;
  expiresAt?: Date;
  data: Record<string, unknown>;
}

export interface UpdateVaultPayload {
  label?: string;
  category?: string;
  description?: string;
  tags?: string[];
  dataType?: string;
  schemaType?: string;
  schemaVersion?: string;
  expiresAt?: Date;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// useCreateVault
// ---------------------------------------------------------------------------

export function useCreateVault() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { encrypt } = useEncryption();

  return useMutation<DecryptedVaultData, Error, CreateVaultPayload>({
    mutationFn: async (payload) => {
      const encryptedFields = await encrypt(JSON.stringify(payload.data));
      const entry = await createVaultEntryAction({
        label: payload.label,
        category: payload.category,
        description: payload.description,
        tags: payload.tags,
        schema_type: payload.schemaType,
        expires_at: payload.expiresAt?.toISOString(),
        ...encryptedFields,
      });
      return { ...entry, data: payload.data, client_ciphertext: undefined as unknown as string, encrypted_dek: undefined as unknown as string, dek_salt: undefined as unknown as string } as unknown as DecryptedVaultData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() });
      toast({ title: 'Success', description: 'Vault entry created successfully' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to create vault entry' });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateVault
// ---------------------------------------------------------------------------

export function useUpdateVault() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { encrypt } = useEncryption();

  return useMutation<DecryptedVaultData, Error, { id: string; data: UpdateVaultPayload }>({
    mutationFn: async ({ id, data: payload }) => {
      // Build update body, re-encrypting data if provided
      const body: {
        label?: string;
        category?: string;
        description?: string;
        tags?: string[];
        schema_type?: string;
        expires_at?: string;
        client_ciphertext?: string;
        encrypted_dek?: string;
        dek_salt?: string;
      } = {};
      if (payload.label !== undefined) body.label = payload.label;
      if (payload.category !== undefined) body.category = payload.category;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.tags !== undefined) body.tags = payload.tags;
      if (payload.schemaType !== undefined) body.schema_type = payload.schemaType;
      if (payload.expiresAt !== undefined) body.expires_at = payload.expiresAt?.toISOString();

      if (payload.data !== undefined) {
        const encryptedFields = await encrypt(JSON.stringify(payload.data));
        Object.assign(body, encryptedFields);
      }

      const entry = await updateVaultEntryAction(id, body);
      const decryptedData = payload.data ?? null;
      const { client_ciphertext: _c, encrypted_dek: _d, dek_salt: _s, ...rest } = entry;
      void _c; void _d; void _s;
      return { ...rest, data: decryptedData } as DecryptedVaultData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.detail(data.id) });
      toast({ title: 'Success', description: 'Vault entry updated successfully' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update vault entry' });
    },
  });
}

// ---------------------------------------------------------------------------
// useDeleteVault
// ---------------------------------------------------------------------------

export function useDeleteVault() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await deleteVaultEntryAction(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() });
      toast({ title: 'Success', description: 'Vault entry deleted successfully' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete vault entry' });
    },
  });
}
