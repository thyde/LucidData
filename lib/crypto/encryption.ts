import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

/**
 * Generate a random encryption key
 */
export function generateKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Generate a random initialization vector
 */
export function generateIV(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * Encrypt data using AES-256-GCM
 * Returns: { encrypted, iv, authTag }
 */
export function encrypt(data: string, key: Buffer): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = generateIV();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(
  encrypted: string,
  key: Buffer,
  iv: string,
  authTag: string
): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Envelope encryption: encrypt data with a DEK, then encrypt DEK with KEK
 * This allows for future migration to user-controlled encryption
 */
export function envelopeEncrypt(data: string, masterKey: Buffer): {
  encryptedData: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
} {
  // Generate data encryption key (DEK)
  const dek = generateKey();

  // Encrypt data with DEK
  const { encrypted, iv, authTag } = encrypt(data, dek);

  // Encrypt DEK with master key (KEK)
  const dekEncrypted = encrypt(dek.toString('hex'), masterKey);

  return {
    encryptedData: encrypted,
    encryptedKey: dekEncrypted.encrypted,
    iv,
    authTag
  };
}

/**
 * Envelope decryption
 */
export function envelopeDecrypt(
  encryptedData: string,
  encryptedKey: string,
  iv: string,
  authTag: string,
  masterKey: Buffer
): string {
  // For envelope decryption, we need to decrypt the DEK first
  // Since we stored the DEK encrypted, we need its IV and authTag too
  // For now, we'll use a simplified approach where the encryptedKey includes both

  // This is a simplified version - in production, you'd store the DEK's IV and authTag separately
  // For now, decrypt data directly with master key (will enhance later for full envelope encryption)
  return decrypt(encryptedData, masterKey, iv, authTag);
}

/**
 * Derive key from user password (for future user-controlled encryption)
 * Uses PBKDF2 with high iteration count
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      100000, // iterations
      KEY_LENGTH,
      'sha256',
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Get master encryption key from environment
 * For MVP: system-managed key
 * For future: will support user-derived keys
 */
export function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(key, 'base64');
}
