/**
 * Key Management Service Tests
 *
 * Tests for envelope encryption (v2) and legacy decryption (v1) compatibility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyManagementService } from '../key-management';
import { encrypt } from '../encryption';

describe('KeyManagementService', () => {
  let keyManagement: KeyManagementService;

  beforeEach(() => {
    // Ensure ENCRYPTION_KEY is set (should be from test/setup.ts)
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'sdEZsqV241TgWLfqENE8yG37OKdWd+FR0PcnAAkX6jQ=';
    }
    keyManagement = new KeyManagementService();
  });

  describe('Constructor', () => {
    it('should initialize with ENCRYPTION_KEY from environment', () => {
      expect(() => new KeyManagementService()).not.toThrow();
    });

    it('should throw error if ENCRYPTION_KEY is missing', () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => new KeyManagementService()).toThrow(
        'ENCRYPTION_KEY environment variable not set'
      );

      process.env.ENCRYPTION_KEY = originalKey;
    });
  });

  describe('envelopeEncrypt', () => {
    it('should encrypt data with envelope encryption', () => {
      const plaintext = 'sensitive data';
      const result = keyManagement.envelopeEncrypt(plaintext);

      // Check result structure
      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('dataIv');
      expect(result).toHaveProperty('dataAuthTag');
      expect(result).toHaveProperty('encryptedDek');
      expect(result).toHaveProperty('dekIv');
      expect(result).toHaveProperty('dekAuthTag');
      expect(result).toHaveProperty('encryptionVersion');

      // Check encryption version
      expect(result.encryptionVersion).toBe('v2');

      // Check all fields are non-empty hex strings
      expect(result.encryptedData).toMatch(/^[0-9a-f]+$/);
      expect(result.dataIv).toMatch(/^[0-9a-f]+$/);
      expect(result.dataAuthTag).toMatch(/^[0-9a-f]+$/);
      expect(result.encryptedDek).toMatch(/^[0-9a-f]+$/);
      expect(result.dekIv).toMatch(/^[0-9a-f]+$/);
      expect(result.dekAuthTag).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique DEK for each encryption', () => {
      const plaintext = 'same data';
      const result1 = keyManagement.envelopeEncrypt(plaintext);
      const result2 = keyManagement.envelopeEncrypt(plaintext);

      // Encrypted data should be different (different DEKs)
      expect(result1.encryptedData).not.toBe(result2.encryptedData);
      expect(result1.encryptedDek).not.toBe(result2.encryptedDek);
    });

    it('should handle empty string', () => {
      const result = keyManagement.envelopeEncrypt('');

      expect(result.encryptionVersion).toBe('v2');
      expect(result.encryptedData).toBe('');
      expect(result.dataIv).toBeTruthy();
      expect(result.dataAuthTag).toBeTruthy();
    });

    it('should handle large data', () => {
      const largeData = 'A'.repeat(10000);
      const result = keyManagement.envelopeEncrypt(largeData);

      expect(result.encryptionVersion).toBe('v2');
      expect(result.encryptedData).toBeTruthy();
    });

    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\r\t';
      const result = keyManagement.envelopeEncrypt(specialChars);

      expect(result.encryptionVersion).toBe('v2');
      expect(result.encryptedData).toBeTruthy();
    });

    it('should handle Unicode characters', () => {
      const unicode = '你好世界 🔐 Héllo Wörld';
      const result = keyManagement.envelopeEncrypt(unicode);

      expect(result.encryptionVersion).toBe('v2');
      expect(result.encryptedData).toBeTruthy();
    });
  });

  describe('envelopeDecrypt', () => {
    it('should decrypt envelope-encrypted data', () => {
      const plaintext = 'sensitive data';
      const encrypted = keyManagement.envelopeEncrypt(plaintext);

      const decrypted = keyManagement.envelopeDecrypt(
        encrypted.encryptedData,
        encrypted.dataIv,
        encrypted.dataAuthTag,
        encrypted.encryptedDek,
        encrypted.dekIv,
        encrypted.dekAuthTag
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should handle roundtrip encryption/decryption', () => {
      const testData = [
        'simple string',
        '123456',
        'special!@#$%',
        'Unicode 你好',
        '{"json": "data"}',
        '',
      ];

      testData.forEach(data => {
        const encrypted = keyManagement.envelopeEncrypt(data);
        const decrypted = keyManagement.envelopeDecrypt(
          encrypted.encryptedData,
          encrypted.dataIv,
          encrypted.dataAuthTag,
          encrypted.encryptedDek,
          encrypted.dekIv,
          encrypted.dekAuthTag
        );
        expect(decrypted).toBe(data);
      });
    });

    it('should throw error with wrong KEK', () => {
      const plaintext = 'sensitive data';
      const encrypted = keyManagement.envelopeEncrypt(plaintext);

      // Change KEK
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'wrongkeywrongkeywrongkeywrongkey1234=';
      const wrongKeyManagement = new KeyManagementService();

      expect(() => {
        wrongKeyManagement.envelopeDecrypt(
          encrypted.encryptedData,
          encrypted.dataIv,
          encrypted.dataAuthTag,
          encrypted.encryptedDek,
          encrypted.dekIv,
          encrypted.dekAuthTag
        );
      }).toThrow();

      // Restore original key
      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should throw error with tampered encrypted data', () => {
      const plaintext = 'sensitive data';
      const encrypted = keyManagement.envelopeEncrypt(plaintext);

      // Tamper with encrypted data
      const tamperedData = encrypted.encryptedData.slice(0, -4) + '0000';

      expect(() => {
        keyManagement.envelopeDecrypt(
          tamperedData,
          encrypted.dataIv,
          encrypted.dataAuthTag,
          encrypted.encryptedDek,
          encrypted.dekIv,
          encrypted.dekAuthTag
        );
      }).toThrow();
    });

    it('should throw error with tampered auth tag', () => {
      const plaintext = 'sensitive data';
      const encrypted = keyManagement.envelopeEncrypt(plaintext);

      // Tamper with auth tag
      const tamperedAuthTag = encrypted.dataAuthTag.slice(0, -4) + '0000';

      expect(() => {
        keyManagement.envelopeDecrypt(
          encrypted.encryptedData,
          encrypted.dataIv,
          tamperedAuthTag,
          encrypted.encryptedDek,
          encrypted.dekIv,
          encrypted.dekAuthTag
        );
      }).toThrow();
    });
  });

  describe('legacyDecrypt', () => {
    it('should decrypt v1 encrypted data', () => {
      // This test requires v1 encrypted data
      // We'll use the encryption module directly to create v1 data
      const kek = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

      const plaintext = 'legacy data';
      const { encrypted, iv, authTag } = encrypt(plaintext, kek);

      const decrypted = keyManagement.legacyDecrypt(encrypted, iv, authTag);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle v1 roundtrip encryption/decryption', () => {
      const kek = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

      const testData = [
        'v1 simple string',
        'v1 special!@#$%',
        '{"v1": "json"}',
      ];

      testData.forEach(data => {
        const { encrypted, iv, authTag } = encrypt(data, kek);
        const decrypted = keyManagement.legacyDecrypt(encrypted, iv, authTag);
        expect(decrypted).toBe(data);
      });
    });
  });

  describe('migrateToEnvelopeEncryption', () => {
    it('should migrate v1 data to v2', () => {
      // Create v1 encrypted data
      const kek = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

      const plaintext = 'data to migrate';
      const v1 = encrypt(plaintext, kek);

      // Migrate to v2
      const v2 = keyManagement.migrateToEnvelopeEncryption(
        v1.encrypted,
        v1.iv,
        v1.authTag
      );

      // Check v2 structure
      expect(v2.encryptionVersion).toBe('v2');
      expect(v2).toHaveProperty('encryptedDek');
      expect(v2).toHaveProperty('dekIv');
      expect(v2).toHaveProperty('dekAuthTag');

      // Decrypt v2 and verify data matches
      const decrypted = keyManagement.envelopeDecrypt(
        v2.encryptedData,
        v2.dataIv,
        v2.dataAuthTag,
        v2.encryptedDek,
        v2.dekIv,
        v2.dekAuthTag
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should preserve data integrity during migration', () => {
      const kek = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

      const testData = [
        'Simple text',
        '{"complex": {"nested": "json", "value": 123}}',
        'Unicode 你好世界 🔐',
        'Special!@#$%^&*()',
        'Very long '.repeat(100) + ' data',
      ];

      testData.forEach(originalPlaintext => {
        // Encrypt with v1
        const v1 = encrypt(originalPlaintext, kek);

        // Migrate to v2
        const v2 = keyManagement.migrateToEnvelopeEncryption(
          v1.encrypted,
          v1.iv,
          v1.authTag
        );

        // Decrypt v2
        const decryptedPlaintext = keyManagement.envelopeDecrypt(
          v2.encryptedData,
          v2.dataIv,
          v2.dataAuthTag,
          v2.encryptedDek,
          v2.dekIv,
          v2.dekAuthTag
        );

        expect(decryptedPlaintext).toBe(originalPlaintext);
      });
    });
  });

  describe('verifyKEK', () => {
    it('should return true for valid KEK', () => {
      const { encrypted, iv, authTag } = keyManagement.generateKEKTest();
      const isValid = keyManagement.verifyKEK(encrypted, iv, authTag);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid KEK', () => {
      const { encrypted, iv, authTag } = keyManagement.generateKEKTest();

      // Change KEK
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'wrongkeywrongkeywrongkeywrongkey1234=';
      const wrongKeyManagement = new KeyManagementService();

      const isValid = wrongKeyManagement.verifyKEK(encrypted, iv, authTag);
      expect(isValid).toBe(false);

      // Restore original key
      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should return false for tampered data', () => {
      const { encrypted, iv, authTag } = keyManagement.generateKEKTest();

      // Tamper with encrypted data
      const tamperedEncrypted = encrypted.slice(0, -4) + '0000';

      const isValid = keyManagement.verifyKEK(tamperedEncrypted, iv, authTag);
      expect(isValid).toBe(false);
    });
  });

  describe('generateKEKTest', () => {
    it('should generate test encryption data', () => {
      const test = keyManagement.generateKEKTest();

      expect(test).toHaveProperty('encrypted');
      expect(test).toHaveProperty('iv');
      expect(test).toHaveProperty('authTag');

      // Verify it can be decrypted
      const decrypted = keyManagement.legacyDecrypt(
        test.encrypted,
        test.iv,
        test.authTag
      );
      expect(decrypted).toBe('KEK_VERIFICATION_TEST');
    });
  });

  describe('Security Properties', () => {
    it('should not expose DEK in plaintext', () => {
      const plaintext = 'sensitive data';
      const result = keyManagement.envelopeEncrypt(plaintext);

      // encryptedDek should be hex string (encrypted)
      expect(result.encryptedDek).toMatch(/^[0-9a-f]+$/);
      // Should not contain plaintext DEK (which would be 64 hex chars)
      expect(result.encryptedDek.length).toBeGreaterThan(64);
    });

    it('should use different IVs for data and DEK', () => {
      const plaintext = 'sensitive data';
      const result = keyManagement.envelopeEncrypt(plaintext);

      // Data IV and DEK IV should be different
      expect(result.dataIv).not.toBe(result.dekIv);
    });

    it('should use proper auth tags for both layers', () => {
      const plaintext = 'sensitive data';
      const result = keyManagement.envelopeEncrypt(plaintext);

      // Both auth tags should be present and different
      expect(result.dataAuthTag).toBeTruthy();
      expect(result.dekAuthTag).toBeTruthy();
      expect(result.dataAuthTag).not.toBe(result.dekAuthTag);

      // Auth tags should be hex strings
      expect(result.dataAuthTag).toMatch(/^[0-9a-f]+$/);
      expect(result.dekAuthTag).toMatch(/^[0-9a-f]+$/);
    });
  });
});
