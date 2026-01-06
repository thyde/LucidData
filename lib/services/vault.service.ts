/**
 * Vault Service - Business logic for vault operations
 * Handles encryption, decryption, and vault data management
 */

import { vaultRepository } from '@/lib/repositories/vault.repository';
import { encrypt, decrypt, getMasterKey } from '@/lib/crypto/encryption';
import { logCryptoError } from '@/lib/services/error-logger';
import { DecryptedVaultData, CreateVaultDataPayload, UpdateVaultDataPayload } from '@/types';
import { VaultData } from '@prisma/client';

export class VaultService {
  /**
   * Get all vault entries for a user (decrypted)
   */
  async getUserVaultData(userId: string): Promise<DecryptedVaultData[]> {
    const entries = await vaultRepository.findByUserId(userId);
    const masterKey = getMasterKey();

    return entries.map((entry) => this.decryptVaultEntry(entry, masterKey, userId));
  }

  /**
   * Get a single vault entry by ID (decrypted)
   */
  async getVaultDataById(id: string, userId: string): Promise<DecryptedVaultData | null> {
    const entry = await vaultRepository.findById(id);

    if (!entry) {
      return null;
    }

    // Verify ownership
    if (entry.userId !== userId) {
      throw new Error('Unauthorized access to vault data');
    }

    const masterKey = getMasterKey();
    return this.decryptVaultEntry(entry, masterKey, userId);
  }

  /**
   * Create a new vault entry (encrypted)
   */
  async createVaultData(
    userId: string,
    payload: CreateVaultDataPayload
  ): Promise<VaultData> {
    const masterKey = getMasterKey();
    const { encrypted, iv, authTag } = encrypt(
      JSON.stringify(payload.data),
      masterKey
    );

    return vaultRepository.create({
      userId,
      category: payload.category,
      dataType: payload.dataType,
      label: payload.label,
      description: payload.description,
      tags: payload.tags ?? [],
      encryptedData: encrypted,
      encryptedKey: 'master-key-1', // TODO: Implement proper key management
      iv: `${iv}:${authTag}`,
      schemaType: payload.schemaType,
      schemaVersion: payload.schemaVersion,
      expiresAt: payload.expiresAt,
    });
  }

  /**
   * Update a vault entry
   */
  async updateVaultData(
    id: string,
    userId: string,
    payload: UpdateVaultDataPayload
  ): Promise<VaultData> {
    // Verify ownership
    const belongsToUser = await vaultRepository.belongsToUser(id, userId);
    if (!belongsToUser) {
      throw new Error('Unauthorized access to vault data');
    }

    const updateData: any = {
      label: payload.label,
      category: payload.category,
      description: payload.description,
      tags: payload.tags,
      expiresAt: payload.expiresAt,
    };

    // Re-encrypt data if provided
    if (payload.data) {
      const masterKey = getMasterKey();
      const { encrypted, iv, authTag } = encrypt(
        JSON.stringify(payload.data),
        masterKey
      );
      updateData.encryptedData = encrypted;
      updateData.iv = `${iv}:${authTag}`;
    }

    return vaultRepository.update(id, updateData);
  }

  /**
   * Delete a vault entry
   */
  async deleteVaultData(id: string, userId: string): Promise<void> {
    // Verify ownership
    const belongsToUser = await vaultRepository.belongsToUser(id, userId);
    if (!belongsToUser) {
      throw new Error('Unauthorized access to vault data');
    }

    await vaultRepository.delete(id);
  }

  /**
   * Get vault statistics for a user
   */
  async getUserStats(userId: string): Promise<{
    totalEntries: number;
    byCategory: Record<string, number>;
  }> {
    const entries = await vaultRepository.findByUserId(userId);

    const byCategory: Record<string, number> = {};
    entries.forEach((entry) => {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    });

    return {
      totalEntries: entries.length,
      byCategory,
    };
  }

  /**
   * Private helper to decrypt a vault entry
   */
  private decryptVaultEntry(
    entry: VaultData,
    masterKey: Buffer,
    userId: string
  ): DecryptedVaultData {
    try {
      const [ivHex, authTagHex] = entry.iv.split(':');
      const decrypted = decrypt(entry.encryptedData, masterKey, ivHex, authTagHex);
      const data = JSON.parse(decrypted);

      return {
        id: entry.id,
        label: entry.label,
        category: entry.category,
        description: entry.description ?? '',
        dataType: entry.dataType,
        tags: entry.tags,
        schemaType: entry.schemaType,
        schemaVersion: entry.schemaVersion,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        data,
      };
    } catch (error) {
      logCryptoError(error, {
        userId,
        action: 'DECRYPT_VAULT_ENTRY',
        resource: entry.id,
      });

      return {
        id: entry.id,
        label: entry.label,
        category: entry.category,
        description: entry.description ?? '',
        dataType: entry.dataType,
        tags: entry.tags,
        schemaType: entry.schemaType,
        schemaVersion: entry.schemaVersion,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        data: null,
        error: 'Decryption failed',
      };
    }
  }
}

// Export singleton instance
export const vaultService = new VaultService();
