-- LD-110: which legal documents a person accepted, and their separate consent
-- to store consumer health data.
--
-- One table holds two kinds of row, told apart by `document`:
--   * acceptance of a published version of the terms, the privacy policy, or
--     the organization terms;
--   * consent to collect consumer health data ('health-data'). Washington's My
--     Health My Data Act requires that consent to be separate from accepting
--     general terms, specific, and withdrawable.
--
-- Rows are evidence, so the table is append-only. Withdrawing consent adds a
-- row; it never edits the grant it withdraws.

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  document TEXT NOT NULL
    CHECK (document IN ('terms', 'privacy', 'organization-terms', 'health-data')),
  version TEXT NOT NULL CHECK (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  action TEXT NOT NULL DEFAULT 'accepted' CHECK (action IN ('accepted', 'withdrawn')),
  source TEXT NOT NULL CHECK (
    source IN ('registration', 'prompt', 'settings', 'health-gate', 'organization-registration')
  ),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Organization terms are accepted for an organization, and nothing else is.
  CONSTRAINT legal_acceptances_organization_scope
    CHECK ((document = 'organization-terms') = (organization_id IS NOT NULL)),
  -- Only consent can be withdrawn. Accepted terms stand until a new version replaces them.
  CONSTRAINT legal_acceptances_withdrawable
    CHECK (action = 'accepted' OR document = 'health-data')
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user
  ON public.legal_acceptances(user_id, document, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_organization
  ON public.legal_acceptances(organization_id)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own acceptances"
  ON public.legal_acceptances FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- A person records only their own acceptance, and only an owner accepts the
-- organization terms for an organization.
CREATE POLICY "Users record their own acceptances"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      organization_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.org_members m
        WHERE m.organization_id = legal_acceptances.organization_id
          AND m.user_id = (SELECT auth.uid())
          AND m.role = 'owner'
      )
    )
  );

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
REVOKE UPDATE, DELETE ON public.legal_acceptances FROM anon, authenticated;

-- Immutable for every role, including the service role. DELETE stays possible
-- because erasing an account cascades here, and erasure outranks our wish to
-- keep evidence about a person whose data is gone.
CREATE OR REPLACE FUNCTION public.reject_legal_acceptance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'legal_acceptances is append-only';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_legal_acceptance_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legal_acceptances_no_update ON public.legal_acceptances;
CREATE TRIGGER trg_legal_acceptances_no_update
  BEFORE UPDATE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.reject_legal_acceptance_update();

COMMENT ON TABLE public.legal_acceptances IS
  'LD-110 versioned acceptance of legal documents and withdrawable consent to store consumer health data. Append-only evidence.';

-- Rights requests from the US states with consumer health data laws, so their
-- own deadlines apply rather than the strict default.
ALTER TABLE public.rights_cases DROP CONSTRAINT IF EXISTS rights_cases_jurisdiction_check;
ALTER TABLE public.rights_cases ADD CONSTRAINT rights_cases_jurisdiction_check
  CHECK (jurisdiction IN ('eu', 'uk', 'us_ca', 'us_wa', 'us_nv', 'us_ct', 'other'));
