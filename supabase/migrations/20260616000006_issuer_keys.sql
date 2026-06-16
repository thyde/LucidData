-- Issuer signing keys (server-custody Ed25519) and domain verification.
-- Private keys are AES-256-GCM encrypted at rest with ISSUER_KEY_SECRET; the
-- server only ever holds plaintext in memory while signing.

-- DNS TXT challenge token for verifying an issuer owns its domain.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS domain_verification_token TEXT;

CREATE TABLE public.issuer_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL UNIQUE,
  alg TEXT NOT NULL DEFAULT 'ed25519' CHECK (alg IN ('ed25519')),
  public_key TEXT NOT NULL,            -- base64(DER SPKI)
  encrypted_private_key TEXT NOT NULL, -- base64(AES-GCM ciphertext of DER PKCS8)
  private_key_iv TEXT NOT NULL,        -- "ivHex:authTagHex"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- RLS on with no policies: only the service role may read keys. Private key
-- material must never be exposed to org members or anon clients.
ALTER TABLE public.issuer_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_issuer_keys_org ON public.issuer_keys(organization_id, status);
