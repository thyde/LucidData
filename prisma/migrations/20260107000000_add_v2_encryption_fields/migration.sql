-- Migration: Add v2 encryption fields to vault_data table
-- This enables envelope encryption (DEK/KEK pattern) while maintaining backward compatibility with v1

-- Add keyIv column (nullable for backward compatibility with v1 entries)
-- Stores DEK IV + auth tag in format: "dekIV:dekAuthTag"
ALTER TABLE "vault_data" ADD COLUMN IF NOT EXISTS "keyIv" TEXT;

-- Add encryptionVersion column with default value 'v1'
-- This column may already exist from schema.prisma default, so we use conditional logic
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vault_data'
        AND column_name = 'encryptionVersion'
    ) THEN
        ALTER TABLE "vault_data" ADD COLUMN "encryptionVersion" TEXT NOT NULL DEFAULT 'v1';
    END IF;
END $$;

-- Set explicit version for existing entries (those without keyIv are v1)
UPDATE "vault_data"
SET "encryptionVersion" = 'v1'
WHERE "keyIv" IS NULL AND "encryptionVersion" != 'v1';

-- Create index on encryptionVersion for efficient migration queries
CREATE INDEX IF NOT EXISTS "vault_data_encryptionVersion_idx" ON "vault_data"("encryptionVersion");

-- Add helpful comment
COMMENT ON COLUMN "vault_data"."keyIv" IS 'DEK IV and auth tag for v2 envelope encryption (format: dekIV:dekAuthTag)';
COMMENT ON COLUMN "vault_data"."encryptionVersion" IS 'Encryption version: v1 (legacy direct KEK) or v2 (envelope DEK/KEK)';
