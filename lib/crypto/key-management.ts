import crypto from 'crypto';
import { encrypt, decrypt, generateKey } from './encryption';

/**
 * Result of envelope encryption operation
 */
export interface EnvelopeEncryptionResult {
  encryptedData: string;
  dataIv: string;
  dataAuthTag: string;
  encryptedDek: string;
  dekIv: string;
  dekAuthTag: string;
  encryptionVersion: string;
}

/**
 * Key Management Service for envelope encryption (DEK/KEK pattern)
 *
 * DEK (Data Encryption Key): Unique AES-256 key per vault entry
 * KEK (Key Encryption Key): Master key from environment
 *
 * Benefits:
 * - Each data entry has its own unique encryption key
 * - KEK can be rotated without re-encrypting all data
 * - Future: Support for user-controlled KEKs
 */
export class KeyManagementService {
  private kek: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }
    // Debug logging to verify correct encryption key is loaded (useful for E2E tests)
    console.log('🔐 Loaded ENCRYPTION_KEY:', key.substring(0, 10) + '...');
    this.kek = Buffer.from(key, 'base64');
  }

  /**
   * Encrypt data using envelope encryption (v2)
   *
   * Process:
   * 1. Generate unique DEK for this data
   * 2. Encrypt data with DEK → (encryptedData, dataIV, dataAuthTag)
   * 3. Encrypt DEK with KEK → (encryptedDek, dekIV, dekAuthTag)
   *
   * @param plaintext - Data to encrypt
   * @returns Envelope encryption result with all components
   */
  envelopeEncrypt(plaintext: string): EnvelopeEncryptionResult {
    // 1. Generate unique DEK for this data
    const dek = generateKey();

    // 2. Encrypt data with DEK
    const {
      encrypted: encryptedData,
      iv: dataIv,
      authTag: dataAuthTag,
    } = encrypt(plaintext, dek);

    // 3. Encrypt DEK with KEK (convert DEK buffer to hex string first)
    const dekHex = dek.toString('hex');
    const {
      encrypted: encryptedDek,
      iv: dekIv,
      authTag: dekAuthTag,
    } = encrypt(dekHex, this.kek);

    return {
      encryptedData,
      dataIv,
      dataAuthTag,
      encryptedDek,
      dekIv,
      dekAuthTag,
      encryptionVersion: 'v2',
    };
  }

  /**
   * Decrypt data using envelope encryption (v2)
   *
   * Process:
   * 1. Decrypt DEK using KEK
   * 2. Decrypt data using DEK
   *
   * @param encryptedData - Encrypted data
   * @param dataIv - Data initialization vector
   * @param dataAuthTag - Data authentication tag
   * @param encryptedDek - Encrypted data encryption key
   * @param dekIv - DEK initialization vector
   * @param dekAuthTag - DEK authentication tag
   * @returns Decrypted plaintext
   */
  envelopeDecrypt(
    encryptedData: string,
    dataIv: string,
    dataAuthTag: string,
    encryptedDek: string,
    dekIv: string,
    dekAuthTag: string
  ): string {
    // 1. Decrypt DEK using KEK
    const dekHex = decrypt(encryptedDek, this.kek, dekIv, dekAuthTag);
    const dek = Buffer.from(dekHex, 'hex');

    // 2. Decrypt data using DEK
    return decrypt(encryptedData, dek, dataIv, dataAuthTag);
  }

  /**
   * Legacy decryption for v1 data (direct KEK encryption)
   *
   * Used for backward compatibility with existing encrypted data.
   * v1 format: Data encrypted directly with KEK (no separate DEK)
   *
   * @param encryptedData - Encrypted data
   * @param iv - Initialization vector
   * @param authTag - Authentication tag
   * @returns Decrypted plaintext
   */
  legacyDecrypt(encryptedData: string, iv: string, authTag: string): string {
    return decrypt(encryptedData, this.kek, iv, authTag);
  }

  /**
   * Migrate v1 entry to v2 envelope encryption
   *
   * Process:
   * 1. Decrypt using legacy method (v1)
   * 2. Re-encrypt using envelope encryption (v2)
   *
   * Use case: One-time migration of existing data
   *
   * @param encryptedData - v1 encrypted data
   * @param iv - v1 initialization vector
   * @param authTag - v1 authentication tag
   * @returns v2 envelope encryption result
   */
  migrateToEnvelopeEncryption(
    encryptedData: string,
    iv: string,
    authTag: string
  ): EnvelopeEncryptionResult {
    // 1. Decrypt using legacy method
    const plaintext = this.legacyDecrypt(encryptedData, iv, authTag);

    // 2. Re-encrypt using envelope encryption
    return this.envelopeEncrypt(plaintext);
  }

  /**
   * Verify that a KEK is valid by attempting to decrypt a test payload
   *
   * @param testEncrypted - Test encrypted data
   * @param testIv - Test IV
   * @param testAuthTag - Test auth tag
   * @returns true if KEK is valid, false otherwise
   */
  verifyKEK(testEncrypted: string, testIv: string, testAuthTag: string): boolean {
    try {
      this.legacyDecrypt(testEncrypted, testIv, testAuthTag);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a test encryption to verify KEK
   * Useful for key rotation scenarios
   *
   * @returns Test encryption components
   */
  generateKEKTest(): { encrypted: string; iv: string; authTag: string } {
    const testData = 'KEK_VERIFICATION_TEST';
    return encrypt(testData, this.kek);
  }
}

/**
 * Singleton instance of KeyManagementService
 * Import this in services that need encryption/decryption
 */
export const keyManagement = new KeyManagementService();
