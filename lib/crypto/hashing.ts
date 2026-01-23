import crypto from 'crypto';

/**
 * Create SHA-256 hash
 */
export function hash(data: string): string {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Create hash chain entry for audit log
 * This creates an immutable chain where each entry's hash depends on the previous entry
 */
export function createAuditHash(
  previousHash: string | null,
  auditData: {
    eventType: string;
    userId: string;
    timestamp: Date;
    action: string;
  }
): string {
  const data = JSON.stringify({
    previousHash: previousHash || '0',
    eventType: auditData.eventType,
    userId: auditData.userId,
    timestamp: auditData.timestamp.toISOString(),
    action: auditData.action,
  });

  return hash(data);
}

/**
 * Verify hash chain integrity
 * Returns true if the chain is valid, false if tampering is detected
 */
export function verifyHashChain(
  entries: Array<{
    currentHash: string;
    previousHash: string | null;
    eventType: string;
    userId: string;
    timestamp: Date;
    action: string;
  }>
): boolean {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Recalculate what the hash should be
    const expectedHash = createAuditHash(
      entry.previousHash,
      {
        eventType: entry.eventType,
        userId: entry.userId,
        timestamp: entry.timestamp,
        action: entry.action,
      }
    );

    // Check if the stored hash matches the expected hash
    if (entry.currentHash !== expectedHash) {
      console.error(`Hash chain verification failed at entry ${i}:`, {
        expected: expectedHash,
        actual: entry.currentHash,
      });
      return false;
    }

    // Verify chain linkage (except for first entry)
    if (i > 0 && entry.previousHash !== entries[i - 1].currentHash) {
      console.error(`Hash chain linkage failed between entries ${i - 1} and ${i}`);
      return false;
    }
  }

  return true;
}

/**
 * Hash password using SHA-256 (for simple password hashing)
 * Note: In production, use bcrypt or argon2 for password hashing
 */
export function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hashedPassword = hash(password + actualSalt);
  return `${actualSalt}:${hashedPassword}`;
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt] = hashedPassword.split(':');
  const hashedAttempt = hashPassword(password, salt);
  return hashedAttempt === hashedPassword;
}
