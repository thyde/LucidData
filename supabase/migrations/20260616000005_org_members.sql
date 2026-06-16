-- Organization member accounts: link Supabase auth users to organizations so
-- issuer/verifier staff can log into the org portal (in addition to API keys).

-- Classify organizations and capture the domain we later verify ownership of.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_type TEXT NOT NULL DEFAULT 'verifier'
    CHECK (org_type IN ('issuer', 'verifier', 'both')),
  ADD COLUMN IF NOT EXISTS domain TEXT;

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'issuer_admin', 'verifier', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Non-recursive policy: a user may read their own membership rows. Org-scoped
-- data access goes through the withOrgMember server guard + service role, so we
-- intentionally avoid a self-referential "is member of org" policy here.
CREATE POLICY "org_members_select_self" ON public.org_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_org_members_user ON public.org_members(user_id);
CREATE INDEX idx_org_members_org ON public.org_members(organization_id);
