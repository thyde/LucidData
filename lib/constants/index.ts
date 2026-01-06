/**
 * Application-wide constants
 * Centralized location for all constant values used across the app
 */

/**
 * Encryption constants
 */
export const ENCRYPTION = {
  ALGORITHM: 'aes-256-gcm' as const,
  KEY_LENGTH: 32, // 256 bits
  IV_LENGTH: 12, // 96 bits
  AUTH_TAG_LENGTH: 16, // 128 bits
  SALT_LENGTH: 16,
  ITERATIONS: 100000,
} as const;

/**
 * Hash constants
 */
export const HASH = {
  ALGORITHM: 'sha256' as const,
  ENCODING: 'hex' as const,
} as const;

/**
 * Password requirements
 */
export const PASSWORD = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: false,
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * API rate limiting
 */
export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100,
} as const;

/**
 * Session configuration
 */
export const SESSION = {
  COOKIE_NAME: 'lucid_session',
  MAX_AGE: 7 * 24 * 60 * 60, // 7 days in seconds
} as const;

/**
 * File upload limits
 */
export const UPLOAD = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: [
    'application/json',
    'application/pdf',
    'text/plain',
    'text/csv',
  ],
} as const;

/**
 * Consent defaults
 */
export const CONSENT = {
  DEFAULT_TERMS_VERSION: '1.0',
  MAX_DURATION_DAYS: 365, // 1 year
} as const;

/**
 * Audit log configuration
 */
export const AUDIT = {
  RETENTION_DAYS: 365 * 7, // 7 years
  BATCH_SIZE: 100,
} as const;

/**
 * Export configuration
 */
export const EXPORT = {
  URL_EXPIRY_HOURS: 24,
  MAX_RETRIES: 3,
} as const;

/**
 * Validation limits
 */
export const VALIDATION = {
  MAX_LABEL_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_TAGS: 10,
  MAX_TAG_LENGTH: 50,
} as const;

/**
 * HTTP status codes (for clarity)
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Error codes for client handling
 */
export const ERROR_CODES = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',

  // Authorization errors
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // Encryption errors
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  INVALID_KEY: 'INVALID_KEY',

  // Audit errors
  AUDIT_INTEGRITY_FAILED: 'AUDIT_INTEGRITY_FAILED',
  HASH_CHAIN_BROKEN: 'HASH_CHAIN_BROKEN',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  VAULT_CREATED: 'Vault entry created successfully',
  VAULT_UPDATED: 'Vault entry updated successfully',
  VAULT_DELETED: 'Vault entry deleted successfully',
  CONSENT_GRANTED: 'Consent granted successfully',
  CONSENT_REVOKED: 'Consent revoked successfully',
  EXPORT_REQUESTED: 'Export request submitted successfully',
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  VAULT_NOT_FOUND: 'Vault entry not found',
  CONSENT_NOT_FOUND: 'Consent not found',
  UNAUTHORIZED_ACCESS: 'You do not have permission to access this resource',
  INVALID_VAULT_DATA: 'Invalid vault data reference',
  DECRYPTION_FAILED: 'Failed to decrypt data',
  AUDIT_INTEGRITY_FAILED: 'Audit log integrity check failed - possible tampering detected',
  INTERNAL_ERROR: 'An internal error occurred. Please try again later.',
} as const;
