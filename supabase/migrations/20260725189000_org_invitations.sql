-- LD-603 organization team management.
--
-- Until now addOrgMember was only ever called from organization registration, so
-- an organization was effectively one person and the whole owner / issuer_admin
-- / verifier / member role model was unreachable. This adds invitations so a
-- second person can actually join.
--
-- Invitations are single use, expire, and are bound to the invited address.

CREATE TABLE IF NOT EXISTS public.org_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'issuer_admin', 'verifier', 'member')),
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256; the raw token only ever lives in the invite link
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- The invited person may see invitations addressed to them. Everything else
-- (listing an organization's invitations, creating, revoking) runs through the
-- service role behind an owner check in the application layer.
CREATE POLICY "org_invitations_select_invitee" ON public.org_invitations
  FOR SELECT USING (
    lower(email) = lower(
      COALESCE((SELECT u.email FROM public.users u WHERE u.id = (SELECT auth.uid())), '')
    )
  );

-- One live invitation per address per organization. A re-invite revokes the old
-- one first, so this cannot silently strand a second pending token.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_pending
  ON public.org_invitations(organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_invitations_org
  ON public.org_invitations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON public.org_invitations(lower(email), status);
