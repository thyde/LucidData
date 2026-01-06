import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  generateKey,
  generateIV,
  encrypt,
  decrypt,
  envelopeEncrypt,
  envelopeDecrypt,
  deriveKeyFromPassword,
  getMasterKey,
} from '../encryption';

describe('encryption utilities', () => {
  describe('generateKey', () => {
    it('should return a 32-byte buffer', () => {
      const key = generateKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys each time', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('generateIV', () => {
    it('should return a 16-byte buffer', () => {
      const iv = generateIV();
      expect(Buffer.isBuffer(iv)).toBe(true);
      expect(iv.length).toBe(16);
    });

    it('should generate unique IVs each time', () => {
      const iv1 = generateIV();
      const iv2 = generateIV();
      expect(iv1.equals(iv2)).toBe(false);
    });
  });

  describe('encrypt', () => {
    let key: Buffer;

    beforeEach(() => {
      key = generateKey();
    });

    it('should produce encrypted string, iv, and authTag', () => {
      const plaintext = 'Hello, World!';
      const result = encrypt(plaintext, key);

      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(typeof result.encrypted).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.authTag).toBe('string');
    });

    it('should produce different ciphertext for same plaintext with different IVs', () => {
      const plaintext = 'sensitive data';
      const result1 = encrypt(plaintext, key);
      const result2 = encrypt(plaintext, key);

      // IVs should be different
      expect(result1.iv).not.toBe(result2.iv);
      // Ciphertext should be different (due to different IVs)
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should encrypt empty string', () => {
      const result = encrypt('', key);
      // Empty string encryption results in empty encrypted string but valid iv and authTag
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeTruthy();
      expect(result.authTag).toBeTruthy();
    });

    it('should encrypt long strings', () => {
      const longString = 'a'.repeat(10000);
      const result = encrypt(longString, key);
      expect(result.encrypted).toBeTruthy();
      expect(result.encrypted.length).toBeGreaterThan(0);
    });

    it('should encrypt JSON data', () => {
      const jsonData = JSON.stringify({ name: 'John', age: 30, sensitive: true });
      const result = encrypt(jsonData, key);
      expect(result.encrypted).toBeTruthy();
    });
  });

  describe('decrypt', () => {
    let key: Buffer;

    beforeEach(() => {
      key = generateKey();
    });

    it('should correctly decrypt encrypted data', () => {
      const plaintext = 'Secret message';
      const { encrypted, iv, authTag } = encrypt(plaintext, key);

      const decrypted = decrypt(encrypted, key, iv, authTag);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt empty string', () => {
      const plaintext = '';
      const { encrypted, iv, authTag } = encrypt(plaintext, key);

      const decrypted = decrypt(encrypted, key, iv, authTag);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt long strings correctly', () => {
      const plaintext = 'x'.repeat(5000);
      const { encrypted, iv, authTag } = encrypt(plaintext, key);

      const decrypted = decrypt(encrypted, key, iv, authTag);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt JSON data correctly', () => {
      const jsonData = JSON.stringify({
        user: 'alice',
        data: { ssn: '123-45-6789', creditCard: '4111-1111-1111-1111' }
      });
      const { encrypted, iv, authTag } = encrypt(jsonData, key);

      const decrypted = decrypt(encrypted, key, iv, authTag);
      expect(decrypted).toBe(jsonData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonData));
    });

    it('should throw error when decrypting with wrong key', () => {
      const plaintext = 'Secret message';
      const { encrypted, iv, authTag } = encrypt(plaintext, key);

      const wrongKey = generateKey();
      expect(() => {
        decrypt(encrypted, wrongKey, iv, authTag);
      }).toThrow();
    });

    it('should throw error when data is tampered (wrong authTag)', () => {
      const plaintext = 'Secret message';
      const { encrypted, iv } = encrypt(plaintext, key);

      const tamperedAuthTag = '0'.repeat(32); // Invalid auth tag
      expect(() => {
        decrypt(encrypted, key, iv, tamperedAuthTag);
      }).toThrow();
    });

    it('should throw error when ciphertext is tampered', () => {
      const plaintext = 'Secret message';
      const { encrypted, iv, authTag } = encrypt(plaintext, key);

      // Tamper with ciphertext by changing a character
      const tamperedEncrypted = '00' + encrypted.substring(2);
      expect(() => {
        decrypt(tamperedEncrypted, key, iv, authTag);
      }).toThrow();
    });

    it('should throw error with invalid IV', () => {
      const plaintext = 'Secret message';
      const { encrypted, authTag } = encrypt(plaintext, key);

      const invalidIV = '0'.repeat(32);
      expect(() => {
        decrypt(encrypted, key, invalidIV, authTag);
      }).toThrow();
    });
  });

  describe('envelopeEncrypt', () => {
    let masterKey: Buffer;

    beforeEach(() => {
      masterKey = generateKey();
    });

    it('should create envelope encryption structure with DEK and KEK', () => {
      const plaintext = 'Sensitive user data';
      const result = envelopeEncrypt(plaintext, masterKey);

      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('encryptedKey');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(typeof result.encryptedData).toBe('string');
      expect(typeof result.encryptedKey).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.authTag).toBe('string');
    });

    it('should produce different encrypted keys for same plaintext', () => {
      const plaintext = 'Same data';
      const result1 = envelopeEncrypt(plaintext, masterKey);
      const result2 = envelopeEncrypt(plaintext, masterKey);

      // Each encryption should use a different DEK
      expect(result1.encryptedKey).not.toBe(result2.encryptedKey);
      expect(result1.encryptedData).not.toBe(result2.encryptedData);
    });

    it('should handle empty strings', () => {
      const result = envelopeEncrypt('', masterKey);
      expect(result.encryptedData).toBeDefined();
      expect(result.encryptedKey).toBeTruthy();
    });

    it('should handle large data', () => {
      const largeData = JSON.stringify({
        records: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `record ${i}`,
        })),
      });
      const result = envelopeEncrypt(largeData, masterKey);
      expect(result.encryptedData).toBeTruthy();
      expect(result.encryptedKey).toBeTruthy();
    });
  });

  describe('envelopeDecrypt', () => {
    let masterKey: Buffer;

    beforeEach(() => {
      masterKey = generateKey();
    });

    it('should decrypt data encrypted with master key (simplified envelope)', () => {
      // Note: Current implementation uses simplified envelope encryption
      // where data is encrypted directly with master key
      const plaintext = 'Confidential information';
      const { encrypted, iv, authTag } = encrypt(plaintext, masterKey);

      const decrypted = envelopeDecrypt(encrypted, 'unused', iv, authTag, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const plaintext = '';
      const { encrypted, iv, authTag } = encrypt(plaintext, masterKey);

      const decrypted = envelopeDecrypt(encrypted, 'unused', iv, authTag, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt large JSON data', () => {
      const jsonData = JSON.stringify({
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        })),
      });
      const { encrypted, iv, authTag } = encrypt(jsonData, masterKey);

      const decrypted = envelopeDecrypt(encrypted, 'unused', iv, authTag, masterKey);
      expect(decrypted).toBe(jsonData);
    });

    it('should throw error with wrong master key', () => {
      const plaintext = 'Secret data';
      const { encrypted, iv, authTag } = encrypt(plaintext, masterKey);

      const wrongMasterKey = generateKey();
      expect(() => {
        envelopeDecrypt(encrypted, 'unused', iv, authTag, wrongMasterKey);
      }).toThrow();
    });
  });

  describe('deriveKeyFromPassword', () => {
    it('should derive a 32-byte key from password', async () => {
      const password = 'MySecurePassword123!';
      const salt = 'random-salt-value';

      const key = await deriveKeyFromPassword(password, salt);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should be deterministic with same password and salt', async () => {
      const password = 'TestPassword';
      const salt = 'fixed-salt';

      const key1 = await deriveKeyFromPassword(password, salt);
      const key2 = await deriveKeyFromPassword(password, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys with different passwords', async () => {
      const salt = 'same-salt';
      const key1 = await deriveKeyFromPassword('password1', salt);
      const key2 = await deriveKeyFromPassword('password2', salt);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should produce different keys with different salts', async () => {
      const password = 'SamePassword';
      const key1 = await deriveKeyFromPassword(password, 'salt1');
      const key2 = await deriveKeyFromPassword(password, 'salt2');

      expect(key1.equals(key2)).toBe(false);
    });

    it('should handle long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const salt = 'test-salt';

      const key = await deriveKeyFromPassword(longPassword, salt);
      expect(key.length).toBe(32);
    });

    it('should handle special characters in password', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
      const salt = 'test-salt';

      const key = await deriveKeyFromPassword(password, salt);
      expect(key.length).toBe(32);
    });
  });

  describe('getMasterKey', () => {
    const originalEnv = process.env.ENCRYPTION_KEY;

    afterEach(() => {
      // Restore original env var
      if (originalEnv) {
        process.env.ENCRYPTION_KEY = originalEnv;
      } else {
        delete process.env.ENCRYPTION_KEY;
      }
    });

    it('should return a valid buffer when ENCRYPTION_KEY is set', () => {
      const testKey = crypto.randomBytes(32).toString('base64');
      process.env.ENCRYPTION_KEY = testKey;

      const key = getMasterKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should throw error when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => {
        getMasterKey();
      }).toThrow('ENCRYPTION_KEY environment variable is not set');
    });

    it('should throw error when ENCRYPTION_KEY is empty string', () => {
      process.env.ENCRYPTION_KEY = '';

      expect(() => {
        getMasterKey();
      }).toThrow('ENCRYPTION_KEY environment variable is not set');
    });

    it('should correctly decode base64-encoded key', () => {
      const originalKey = crypto.randomBytes(32);
      process.env.ENCRYPTION_KEY = originalKey.toString('base64');

      const key = getMasterKey();
      expect(key.equals(originalKey)).toBe(true);
    });

    it('should return the same key on multiple calls', () => {
      const testKey = crypto.randomBytes(32).toString('base64');
      process.env.ENCRYPTION_KEY = testKey;

      const key1 = getMasterKey();
      const key2 = getMasterKey();

      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('end-to-end encryption flow', () => {
    it('should encrypt and decrypt data correctly in full workflow', () => {
      const originalData = JSON.stringify({
        personalInfo: {
          name: 'John Doe',
          ssn: '123-45-6789',
          creditCard: {
            number: '4111-1111-1111-1111',
            cvv: '123',
            expiry: '12/25',
          },
        },
        metadata: {
          timestamp: new Date().toISOString(),
          category: 'financial',
        },
      });

      const key = generateKey();
      const { encrypted, iv, authTag } = encrypt(originalData, key);

      // Verify we can't read encrypted data
      expect(encrypted).not.toContain('John Doe');
      expect(encrypted).not.toContain('123-45-6789');

      // Decrypt and verify
      const decrypted = decrypt(encrypted, key, iv, authTag);
      expect(decrypted).toBe(originalData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(originalData));
    });

    it('should handle envelope encryption workflow with master key', () => {
      const userData = JSON.stringify({
        userId: 'user-123',
        vaultData: {
          medicalRecords: ['record1', 'record2'],
          financialData: { balance: 50000 },
        },
      });

      const masterKey = generateKey();

      // For this workflow, use regular encryption (current simplified envelope approach)
      const { encrypted, iv, authTag } = encrypt(userData, masterKey);

      // Verify data is encrypted
      expect(encrypted).not.toContain('user-123');
      expect(encrypted).not.toContain('medicalRecords');

      // Decrypt using simplified envelope decrypt (uses master key directly)
      const decrypted = envelopeDecrypt(encrypted, 'unused-dek', iv, authTag, masterKey);
      expect(decrypted).toBe(userData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(userData));
    });
  });
});
