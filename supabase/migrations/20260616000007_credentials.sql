-- Issued credentials: signed claims an issuer mints for a subject (by email),
-- which the subject later claims into their vault. The signed_payload + signature
-- are what verifiers check against the issuer's public key.

CREATE TABLE public.issued_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject_email TEXT NOT NULL,
  schema_type TEXT NOT NULL,
  label TEXT NOT NULL,
  claims JSONB NOT NULL,
  signed_payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  key_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  revocation_reason TEXT,
  claimed_at TIMESTAMPTZ,
  vault_data_id UUID REFERENCES public.vault_data(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.issued_credentials ENABLE ROW LEVEL SECURITY;

-- Subjects may read credentials already assigned to them. Issuer reads and
-- email-based claim lookups go through the service role in guarded actions.
CREATE POLICY "ic_select_subject" ON public.issued_credentials
  FOR SELECT USING (auth.uid() = subject_user_id);

CREATE INDEX idx_ic_subject_user ON public.issued_credentials(subject_user_id);
CREATE INDEX idx_ic_subject_email ON public.issued_credentials(lower(subject_email));
CREATE INDEX idx_ic_org ON public.issued_credentials(organization_id, issued_at DESC);
