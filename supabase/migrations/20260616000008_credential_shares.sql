-- Credential shares: a holder grants a verifier time-boxed, revocable access to
-- a selected subset of a credential's claims via a tokenized public link.
-- Only the SHA-256 of the token is stored; the raw token lives only in the URL.

CREATE TABLE public.credential_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id UUID NOT NULL REFERENCES public.issued_credentials(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  disclosed_claims TEXT[] NOT NULL DEFAULT '{}',
  verifier_email TEXT,
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.credential_shares ENABLE ROW LEVEL SECURITY;

-- Holders manage their own shares. Public verification goes through the service
-- role keyed by the token hash (the token itself proves authorization).
CREATE POLICY "cs_all_own" ON public.credential_shares
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_cs_user ON public.credential_shares(user_id, created_at DESC);
CREATE INDEX idx_cs_credential ON public.credential_shares(credential_id);
