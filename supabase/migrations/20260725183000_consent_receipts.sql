-- LD-303 signed consent receipts.
--
-- Every consent state change produces a portable, server-signed artifact both
-- the subject and the named recipient can keep and present. Receipts are
-- append-only: revocation and extension emit a NEW receipt that references the
-- one it supersedes, never a mutation of the original.

-- Platform signing keys. Same custody model as issuer_keys: Ed25519 private key
-- AES-256-GCM-wrapped at rest with ISSUER_KEY_SECRET, service role only.
CREATE TABLE IF NOT EXISTS public.platform_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purpose TEXT NOT NULL,
  key_id TEXT NOT NULL UNIQUE,
  alg TEXT NOT NULL DEFAULT 'ed25519' CHECK (alg IN ('ed25519')),
  public_key TEXT NOT NULL,            -- base64(DER SPKI)
  encrypted_private_key TEXT NOT NULL, -- base64(AES-GCM ciphertext of DER PKCS8)
  private_key_iv TEXT NOT NULL,        -- "ivHex:authTagHex"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- RLS on with no policy: private key material never reaches anon or
-- authenticated roles. Reads go through the service role.
ALTER TABLE public.platform_keys ENABLE ROW LEVEL SECURITY;

-- At most one active key per purpose. Also makes get-or-create race safe: a
-- concurrent insert loses with 23505 and re-reads the winner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_keys_active_purpose
  ON public.platform_keys(purpose)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.consent_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consent_id UUID NOT NULL REFERENCES public.consents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('granted', 'extended', 'revoked')),
  recipient TEXT NOT NULL,
  recipient_email TEXT,
  supersedes_receipt_id UUID REFERENCES public.consent_receipts(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,   -- exactly the object the signature covers
  signature TEXT NOT NULL,  -- base64url Ed25519 over the canonical payload
  key_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.consent_receipts ENABLE ROW LEVEL SECURITY;

-- The subject reads their own receipts.
CREATE POLICY "consent_receipts_select_own" ON public.consent_receipts
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- The named recipient organization reads receipts addressed to it, so it can
-- evidence lawful access during an audit.
CREATE POLICY "consent_receipts_select_recipient" ON public.consent_receipts
  FOR SELECT USING (
    recipient_email IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.org_members m
      JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.user_id = (SELECT auth.uid())
        AND lower(o.email) = lower(public.consent_receipts.recipient_email)
    )
  );

-- No INSERT/UPDATE/DELETE policies: receipts are written by the service role and
-- are never edited.

CREATE INDEX IF NOT EXISTS idx_consent_receipts_consent
  ON public.consent_receipts(consent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_receipts_user
  ON public.consent_receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_receipts_recipient_email
  ON public.consent_receipts(lower(recipient_email));
CREATE INDEX IF NOT EXISTS idx_consent_receipts_supersedes
  ON public.consent_receipts(supersedes_receipt_id);
