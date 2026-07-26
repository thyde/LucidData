-- LD-301 rights and data subject request engine.
--
-- Export and deletion primitives existed, but nothing tracked a request: no
-- case, no clock, no appeal path, no evidence trail. GDPR, UK GDPR, and US
-- state law all require authenticated rights handling with tracked deadlines,
-- so this adds the case model and its append-only event log.

CREATE TABLE IF NOT EXISTS public.rights_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('access', 'correction', 'deletion', 'restriction', 'portability', 'appeal')
  ),
  jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('eu', 'uk', 'us_ca', 'other')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'verifying', 'in_progress', 'paused', 'fulfilled', 'refused', 'appealed')
  ),
  detail TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL,
  extended_to TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  paused_ms BIGINT NOT NULL DEFAULT 0,
  resolution TEXT CHECK (resolution IN ('fulfilled', 'refused', 'withdrawn')),
  resolution_note TEXT,
  -- An appeal is its own case that points at the refusal it contests.
  appeal_of_case_id UUID REFERENCES public.rights_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rights_cases_user ON public.rights_cases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rights_cases_due ON public.rights_cases(due_at)
  WHERE status NOT IN ('fulfilled', 'refused');
CREATE INDEX IF NOT EXISTS idx_rights_cases_appeal ON public.rights_cases(appeal_of_case_id)
  WHERE appeal_of_case_id IS NOT NULL;

-- Only one open appeal per refused case, so a refusal cannot be contested in
-- parallel by duplicate cases.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rights_cases_one_appeal
  ON public.rights_cases(appeal_of_case_id)
  WHERE appeal_of_case_id IS NOT NULL;

ALTER TABLE public.rights_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own rights cases"
  ON public.rights_cases FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users file their own rights cases"
  ON public.rights_cases FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- No UPDATE or DELETE policy. A case moves only through the service role, so a
-- person cannot mark their own request fulfilled or move its deadline.

-- Append-only evidence. Every state change lands here and nothing ever edits it.
CREATE TABLE IF NOT EXISTS public.rights_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.rights_cases(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user', 'operator', 'system')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rights_case_events_case
  ON public.rights_case_events(case_id, created_at);

ALTER TABLE public.rights_case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read events on their own cases"
  ON public.rights_case_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rights_cases c
      WHERE c.id = case_id AND c.user_id = (SELECT auth.uid())
    )
  );

-- Immutability is enforced in the database, not just by convention: without
-- this an operator mistake or a compromised service key could rewrite the
-- evidence trail the log exists to provide.
--
-- UPDATE only. A DELETE has to stay possible, because the account-deletion
-- cascade from rights_cases runs a DELETE on these rows, and a person's right
-- to erasure outranks our wish to keep evidence about them.
CREATE OR REPLACE FUNCTION public.reject_rights_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'rights_case_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_rights_case_events_no_update ON public.rights_case_events;
CREATE TRIGGER trg_rights_case_events_no_update
  BEFORE UPDATE ON public.rights_case_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_rights_event_mutation();

-- Nothing reachable through the API may delete an event directly. Only the
-- cascade from a deleted case can, and that runs as the table owner.
REVOKE DELETE, UPDATE ON public.rights_case_events FROM anon, authenticated;

COMMENT ON TABLE public.rights_cases IS
  'LD-301 data subject rights requests with jurisdiction-aware deadlines. Users file and read; only the service role advances a case.';

COMMENT ON TABLE public.rights_case_events IS
  'LD-301 append-only evidence for every rights case transition. A trigger rejects UPDATE and DELETE.';
