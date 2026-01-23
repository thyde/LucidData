/**
 * Environment variable validation
 * Ensures all required environment variables are set at startup
 * Prevents runtime errors from missing configuration
 */

interface EnvConfig {
  // Supabase
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;

  // Database
  databaseUrl: string;

  // Encryption
  encryptionKey: string;

  // Application
  appUrl: string;
  nodeEnv: string;
}

class EnvironmentValidator {
  private config: EnvConfig | null = null;

  /**
   * Validate and return environment configuration
   * Throws detailed error if any required variables are missing
   */
  validate(): EnvConfig {
    if (this.config) {
      return this.config;
    }

    const errors: string[] = [];

    // Supabase configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      errors.push('NEXT_PUBLIC_SUPABASE_URL is not set');
    }

    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseAnonKey) {
      errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
    }

    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseServiceRoleKey) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY is not set');
    }

    // Database configuration
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      errors.push('DATABASE_URL is not set');
    }

    // Encryption configuration
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      errors.push('ENCRYPTION_KEY is not set');
    } else {
      // Validate encryption key format
      try {
        const keyBuffer = Buffer.from(encryptionKey, 'base64');
        if (keyBuffer.length !== 32) {
          errors.push(
            `ENCRYPTION_KEY must be 32 bytes (256 bits), got ${keyBuffer.length} bytes`
          );
        }
      } catch {
        errors.push('ENCRYPTION_KEY is not valid base64');
      }
    }

    // Application configuration
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      errors.push('NEXT_PUBLIC_APP_URL is not set');
    }

    const nodeEnv = process.env.NODE_ENV || 'development';

    if (errors.length > 0) {
      throw new Error(
        `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
          `Please check your .env.local file and ensure all required variables are set.`
      );
    }

    this.config = {
      supabaseUrl: supabaseUrl!,
      supabaseAnonKey: supabaseAnonKey!,
      supabaseServiceRoleKey: supabaseServiceRoleKey!,
      databaseUrl: databaseUrl!,
      encryptionKey: encryptionKey!,
      appUrl: appUrl!,
      nodeEnv,
    };

    return this.config;
  }

  /**
   * Get validated config (throws if not validated yet)
   */
  getConfig(): EnvConfig {
    if (!this.config) {
      return this.validate();
    }
    return this.config;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.getConfig().nodeEnv === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.getConfig().nodeEnv === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.getConfig().nodeEnv === 'test';
  }
}

// Export singleton instance
export const envValidator = new EnvironmentValidator();

// Validate on module load (only on server side)
if (typeof window === 'undefined') {
  try {
    envValidator.validate();
  } catch (error) {
    console.error('Environment validation failed:', error);
    // In production, we want to fail fast
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

// Export convenience functions
export const getEnvConfig = () => envValidator.getConfig();
export const isProduction = () => envValidator.isProduction();
export const isDevelopment = () => envValidator.isDevelopment();
export const isTest = () => envValidator.isTest();
