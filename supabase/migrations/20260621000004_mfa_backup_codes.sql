-- One-time backup codes for two-factor recovery. Redeeming a code disables the
-- user's TOTP factor so they can sign in again and re-enroll. Only hashes are
-- stored; the plaintext codes are shown to the user once at generation.
-- Service-role writes; users may read their own rows (status/count only).

CREATE TABLE public.mfa_backup_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mfa_backup_codes_select_own" ON public.mfa_backup_codes
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_mfa_backup_user ON public.mfa_backup_codes(user_id, used_at);
