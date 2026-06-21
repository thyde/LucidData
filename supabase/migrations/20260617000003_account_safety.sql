-- Account safety: recovery-code vault escrow + onboarding flag.
--
-- The master key is derived from the user's password (PBKDF2, 600k) in the browser
-- and never reaches the server, so a Supabase password reset would otherwise orphan
-- every vault entry's wrapped DEK. To make recovery possible the browser escrows an
-- extractable copy of the master key, AES-GCM-wrapped with a key derived from a
-- one-time recovery code that only the user holds. The server stores only the
-- ciphertext (wrapped_master_key) and the PBKDF2 salt (recovery_code_salt); without
-- the recovery code (or the password) it cannot derive the master key, so the
-- zero-knowledge guarantee holds.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wrapped_master_key TEXT,
  ADD COLUMN IF NOT EXISTS recovery_code_salt TEXT,
  ADD COLUMN IF NOT EXISTS recovery_codes_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- The existing users_select_own / users_update_own policies already scope these
-- columns to the owning user (auth.uid() = id), so no new policies are required.
