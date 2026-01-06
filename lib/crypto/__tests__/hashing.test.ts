import { describe, it, expect, beforeEach } from 'vitest';
import {
  hash,
  createAuditHash,
  verifyHashChain,
  hashPassword,
  verifyPassword,
} from '../hashing';

describe('hashing utilities', () => {
  describe('hash', () => {
    it('should produce SHA-256 hex string', () => {
      const data = 'test data';
      const hashed = hash(data);

      expect(typeof hashed).toBe('string');
      expect(hashed).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(hashed).toMatch(/^[a-f0-9]{64}$/); // Only hex characters
    });

    it('should be deterministic - same input produces same hash', () => {
      const data = 'consistent data';
      const hash1 = hash(data);
      const hash2 = hash(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hash('data1');
      const hash2 = hash('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hashed = hash('');
      expect(hashed).toHaveLength(64);
      expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(100000);
      const hashed = hash(longString);

      expect(hashed).toHaveLength(64);
    });

    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\n\t\r';
      const hashed = hash(specialChars);

      expect(hashed).toHaveLength(64);
    });

    it('should handle Unicode characters', () => {
      const unicode = '你好世界 🌍 مرحبا العالم';
      const hashed = hash(unicode);

      expect(hashed).toHaveLength(64);
    });

    it('should produce different hash for similar strings', () => {
      const hash1 = hash('test');
      const hash2 = hash('Test'); // Different case
      const hash3 = hash('test '); // Extra space

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });
  });

  describe('createAuditHash', () => {
    const baseAuditData = {
      eventType: 'data_created',
      userId: 'user-123',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      action: 'create',
    };

    it('should create hash with null previousHash for chain start', () => {
      const auditHash = createAuditHash(null, baseAuditData);

      expect(typeof auditHash).toBe('string');
      expect(auditHash).toHaveLength(64);
      expect(auditHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should create hash with previousHash for chain continuation', () => {
      const previousHash = 'abc123' + '0'.repeat(58); // 64 char hex string
      const auditHash = createAuditHash(previousHash, baseAuditData);

      expect(typeof auditHash).toBe('string');
      expect(auditHash).toHaveLength(64);
      expect(auditHash).not.toBe(previousHash);
    });

    it('should be deterministic with same inputs', () => {
      const hash1 = createAuditHash(null, baseAuditData);
      const hash2 = createAuditHash(null, baseAuditData);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash with different previousHash', () => {
      const hash1 = createAuditHash(null, baseAuditData);
      const hash2 = createAuditHash('previous-hash', baseAuditData);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash with different eventType', () => {
      const hash1 = createAuditHash(null, { ...baseAuditData, eventType: 'data_created' });
      const hash2 = createAuditHash(null, { ...baseAuditData, eventType: 'data_updated' });

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash with different userId', () => {
      const hash1 = createAuditHash(null, { ...baseAuditData, userId: 'user-123' });
      const hash2 = createAuditHash(null, { ...baseAuditData, userId: 'user-456' });

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash with different timestamp', () => {
      const hash1 = createAuditHash(null, {
        ...baseAuditData,
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
      });
      const hash2 = createAuditHash(null, {
        ...baseAuditData,
        timestamp: new Date('2024-01-01T00:00:01.000Z'),
      });

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash with different action', () => {
      const hash1 = createAuditHash(null, { ...baseAuditData, action: 'create' });
      const hash2 = createAuditHash(null, { ...baseAuditData, action: 'update' });

      expect(hash1).not.toBe(hash2);
    });

    it('should handle all audit event types', () => {
      const eventTypes = [
        'data_created',
        'data_updated',
        'data_deleted',
        'data_accessed',
        'consent_granted',
        'consent_revoked',
        'audit_accessed',
      ];

      eventTypes.forEach(eventType => {
        const auditHash = createAuditHash(null, { ...baseAuditData, eventType });
        expect(auditHash).toHaveLength(64);
      });
    });
  });

  describe('verifyHashChain', () => {
    it('should validate a correct single-entry chain', () => {
      const entry = {
        currentHash: '',
        previousHash: null,
        eventType: 'data_created',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        action: 'create',
      };

      // Calculate the correct hash
      entry.currentHash = createAuditHash(null, {
        eventType: entry.eventType,
        userId: entry.userId,
        timestamp: entry.timestamp,
        action: entry.action,
      });

      const isValid = verifyHashChain([entry]);
      expect(isValid).toBe(true);
    });

    it('should validate a correct multi-entry chain', () => {
      const entry1 = {
        currentHash: '',
        previousHash: null,
        eventType: 'data_created',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        action: 'create',
      };

      // Calculate hash for first entry
      entry1.currentHash = createAuditHash(null, {
        eventType: entry1.eventType,
        userId: entry1.userId,
        timestamp: entry1.timestamp,
        action: entry1.action,
      });

      const entry2 = {
        currentHash: '',
        previousHash: entry1.currentHash,
        eventType: 'data_updated',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T01:00:00.000Z'),
        action: 'update',
      };

      // Calculate hash for second entry
      entry2.currentHash = createAuditHash(entry1.currentHash, {
        eventType: entry2.eventType,
        userId: entry2.userId,
        timestamp: entry2.timestamp,
        action: entry2.action,
      });

      const isValid = verifyHashChain([entry1, entry2]);
      expect(isValid).toBe(true);
    });

    it('should detect broken chain with tampered hash', () => {
      const entry1 = {
        currentHash: '',
        previousHash: null,
        eventType: 'data_created',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        action: 'create',
      };

      entry1.currentHash = createAuditHash(null, {
        eventType: entry1.eventType,
        userId: entry1.userId,
        timestamp: entry1.timestamp,
        action: entry1.action,
      });

      const entry2 = {
        currentHash: '',
        previousHash: entry1.currentHash,
        eventType: 'data_updated',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T01:00:00.000Z'),
        action: 'update',
      };

      entry2.currentHash = createAuditHash(entry1.currentHash, {
        eventType: entry2.eventType,
        userId: entry2.userId,
        timestamp: entry2.timestamp,
        action: entry2.action,
      });

      // Tamper with the hash
      entry2.currentHash = 'tampered' + entry2.currentHash.substring(8);

      const isValid = verifyHashChain([entry1, entry2]);
      expect(isValid).toBe(false);
    });

    it('should detect broken chain with incorrect linkage', () => {
      const entry1 = {
        currentHash: '',
        previousHash: null,
        eventType: 'data_created',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        action: 'create',
      };

      entry1.currentHash = createAuditHash(null, {
        eventType: entry1.eventType,
        userId: entry1.userId,
        timestamp: entry1.timestamp,
        action: entry1.action,
      });

      const entry2 = {
        currentHash: '',
        previousHash: 'wrong-previous-hash', // Incorrect link
        eventType: 'data_updated',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T01:00:00.000Z'),
        action: 'update',
      };

      entry2.currentHash = createAuditHash('wrong-previous-hash', {
        eventType: entry2.eventType,
        userId: entry2.userId,
        timestamp: entry2.timestamp,
        action: entry2.action,
      });

      const isValid = verifyHashChain([entry1, entry2]);
      expect(isValid).toBe(false);
    });

    it('should validate empty chain', () => {
      const isValid = verifyHashChain([]);
      expect(isValid).toBe(true);
    });

    it('should validate a long chain', () => {
      const entries = [];
      let previousHash = null;

      // Create a chain of 10 entries
      for (let i = 0; i < 10; i++) {
        const entry = {
          currentHash: '',
          previousHash,
          eventType: 'data_created',
          userId: `user-${i}`,
          timestamp: new Date(2024, 0, 1, i, 0, 0),
          action: 'create',
        };

        entry.currentHash = createAuditHash(previousHash, {
          eventType: entry.eventType,
          userId: entry.userId,
          timestamp: entry.timestamp,
          action: entry.action,
        });

        entries.push(entry);
        previousHash = entry.currentHash;
      }

      const isValid = verifyHashChain(entries);
      expect(isValid).toBe(true);
    });

    it('should detect tampering in middle of long chain', () => {
      const entries = [];
      let previousHash = null;

      // Create a chain of 10 entries
      for (let i = 0; i < 10; i++) {
        const entry = {
          currentHash: '',
          previousHash,
          eventType: 'data_created',
          userId: `user-${i}`,
          timestamp: new Date(2024, 0, 1, i, 0, 0),
          action: 'create',
        };

        entry.currentHash = createAuditHash(previousHash, {
          eventType: entry.eventType,
          userId: entry.userId,
          timestamp: entry.timestamp,
          action: entry.action,
        });

        entries.push(entry);
        previousHash = entry.currentHash;
      }

      // Tamper with entry in the middle (index 5)
      entries[5].action = 'tampered';

      const isValid = verifyHashChain(entries);
      expect(isValid).toBe(false);
    });

    it('should detect if data was modified after hashing', () => {
      const entry = {
        currentHash: '',
        previousHash: null,
        eventType: 'data_created',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        action: 'create',
      };

      entry.currentHash = createAuditHash(null, {
        eventType: entry.eventType,
        userId: entry.userId,
        timestamp: entry.timestamp,
        action: entry.action,
      });

      // Modify data after hash was created
      entry.userId = 'user-456';

      const isValid = verifyHashChain([entry]);
      expect(isValid).toBe(false);
    });
  });

  describe('hashPassword', () => {
    it('should include salt in the result', () => {
      const password = 'MyPassword123!';
      const hashed = hashPassword(password);

      expect(hashed).toContain(':');
      const [salt, hash] = hashed.split(':');
      expect(salt).toBeTruthy();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(64); // SHA-256 hex
    });

    it('should generate different hashes for same password (random salt)', () => {
      const password = 'SamePassword';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic with provided salt', () => {
      const password = 'TestPassword';
      const salt = 'fixed-salt-value';

      const hash1 = hashPassword(password, salt);
      const hash2 = hashPassword(password, salt);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash with different salts', () => {
      const password = 'Password123';
      const hash1 = hashPassword(password, 'salt1');
      const hash2 = hashPassword(password, 'salt2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', () => {
      const hashed = hashPassword('');
      const [salt, hash] = hashed.split(':');

      expect(salt).toBeTruthy();
      expect(hash).toBeTruthy();
    });

    it('should handle long passwords', () => {
      const longPassword = 'a'.repeat(1000);
      const hashed = hashPassword(longPassword);
      const [salt, hash] = hashed.split(':');

      expect(salt).toBeTruthy();
      expect(hash).toHaveLength(64);
    });

    it('should handle special characters', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
      const hashed = hashPassword(password);
      const [salt, hash] = hashed.split(':');

      expect(salt).toBeTruthy();
      expect(hash).toBeTruthy();
    });

    it('should produce different hashes for different passwords', () => {
      const salt = 'same-salt';
      const hash1 = hashPassword('password1', salt);
      const hash2 = hashPassword('password2', salt);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should validate correct password', () => {
      const password = 'CorrectPassword123!';
      const hashed = hashPassword(password);

      const isValid = verifyPassword(password, hashed);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', () => {
      const password = 'CorrectPassword';
      const hashed = hashPassword(password);

      const isValid = verifyPassword('WrongPassword', hashed);
      expect(isValid).toBe(false);
    });

    it('should reject password with different case', () => {
      const password = 'Password';
      const hashed = hashPassword(password);

      const isValid = verifyPassword('password', hashed);
      expect(isValid).toBe(false);
    });

    it('should reject password with extra characters', () => {
      const password = 'password';
      const hashed = hashPassword(password);

      const isValid = verifyPassword('password ', hashed);
      expect(isValid).toBe(false);
    });

    it('should handle empty password', () => {
      const password = '';
      const hashed = hashPassword(password);

      const isValid = verifyPassword('', hashed);
      expect(isValid).toBe(true);

      const isInvalid = verifyPassword('not-empty', hashed);
      expect(isInvalid).toBe(false);
    });

    it('should handle long passwords', () => {
      const password = 'a'.repeat(1000);
      const hashed = hashPassword(password);

      const isValid = verifyPassword(password, hashed);
      expect(isValid).toBe(true);

      const isInvalid = verifyPassword('a'.repeat(999), hashed);
      expect(isInvalid).toBe(false);
    });

    it('should handle special characters', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
      const hashed = hashPassword(password);

      const isValid = verifyPassword(password, hashed);
      expect(isValid).toBe(true);
    });

    it('should work with deterministic hashing (fixed salt)', () => {
      const password = 'TestPassword';
      const salt = 'fixed-salt';
      const hashed = hashPassword(password, salt);

      const isValid = verifyPassword(password, hashed);
      expect(isValid).toBe(true);

      const isInvalid = verifyPassword('WrongPassword', hashed);
      expect(isInvalid).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should support audit log chain creation and verification', () => {
      const auditLogs = [];

      // Create first audit log entry (chain start)
      const entry1 = {
        currentHash: '',
        previousHash: null,
        eventType: 'data_created',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T10:00:00.000Z'),
        action: 'User created vault data',
      };
      entry1.currentHash = createAuditHash(null, entry1);
      auditLogs.push(entry1);

      // Create second entry (linked to first)
      const entry2 = {
        currentHash: '',
        previousHash: entry1.currentHash,
        eventType: 'consent_granted',
        userId: 'user-123',
        timestamp: new Date('2024-01-01T11:00:00.000Z'),
        action: 'User granted consent to third party',
      };
      entry2.currentHash = createAuditHash(entry1.currentHash, entry2);
      auditLogs.push(entry2);

      // Create third entry
      const entry3 = {
        currentHash: '',
        previousHash: entry2.currentHash,
        eventType: 'data_accessed',
        userId: 'buyer-456',
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        action: 'Third party accessed data',
      };
      entry3.currentHash = createAuditHash(entry2.currentHash, entry3);
      auditLogs.push(entry3);

      // Verify the chain
      const isValid = verifyHashChain(auditLogs);
      expect(isValid).toBe(true);

      // Verify chain detects tampering
      auditLogs[1].action = 'Modified action';
      const isInvalid = verifyHashChain(auditLogs);
      expect(isInvalid).toBe(false);
    });

    it('should support password hashing and verification workflow', () => {
      // User registration: hash password
      const userPassword = 'SecurePassword123!';
      const hashedPassword = hashPassword(userPassword);

      // Store hashedPassword in database (simulated)
      const storedHash = hashedPassword;

      // User login: verify password
      const loginAttempt1 = verifyPassword('SecurePassword123!', storedHash);
      expect(loginAttempt1).toBe(true);

      const loginAttempt2 = verifyPassword('WrongPassword', storedHash);
      expect(loginAttempt2).toBe(false);

      const loginAttempt3 = verifyPassword('securepassword123!', storedHash);
      expect(loginAttempt3).toBe(false);
    });
  });
});
