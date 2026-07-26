-- LD-604 bulk and asynchronous organization operations.
--
-- Institutional volume is the normal case, not the exception. A university
-- issues thousands of credentials at graduation and an insurer renews an entire
-- book on the policy anniversary. Today each of those is one record through one
-- endpoint, so a licensing body revoking a cohort iterates one call at a time.
--
-- Two design points drive the shape below.
--
-- Per-row status, not per-job. A bulk operation with one bad email must not
-- fail wholesale, and the operator has to be able to see which rows failed and
-- retry only those.
--
-- Row payloads are the uploaded file. They carry personal data about people who
-- may not have accounts, so a payload is cleared the moment its row succeeds,
-- and the whole job is purged on a retention clock.

CREATE TABLE IF NOT EXISTS public.bulk_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('credential_issue', 'credential_revoke', 'consent_request')
  ),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  ),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  succeeded_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  -- Set by an operator asking to stop. The runner checks it between rows, so a
  -- cancellation takes effect without killing a row mid-flight.
  cancel_requested_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_org
  ON public.bulk_jobs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_runnable
  ON public.bulk_jobs(created_at)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS public.bulk_job_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.bulk_jobs(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  -- Derived from the row content. A retry re-uses the same key, which is what
  -- stops a resumed job from issuing a credential twice.
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'succeeded', 'failed', 'skipped')
  ),
  result_id UUID,
  error TEXT,
  processed_at TIMESTAMPTZ,
  UNIQUE (job_id, row_index),
  UNIQUE (job_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_bulk_job_rows_pending
  ON public.bulk_job_rows(job_id)
  WHERE status = 'pending';

-- Members read their own organization's jobs and row outcomes, so a failed
-- import is inspectable without asking us. Writes go through the service role:
-- a member editing a row status could mark a failed issuance as succeeded.
ALTER TABLE public.bulk_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organization bulk jobs"
  ON public.bulk_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.organization_id = organization_id AND m.user_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.bulk_job_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organization bulk job rows"
  ON public.bulk_job_rows FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bulk_jobs j
      JOIN public.org_members m ON m.organization_id = j.organization_id
      WHERE j.id = job_id AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.bulk_jobs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bulk_job_rows FROM anon, authenticated;

COMMENT ON TABLE public.bulk_jobs IS
  'LD-604 asynchronous bulk operations with per-row outcomes. Purged on a retention clock because rows carry uploaded personal data.';

COMMENT ON COLUMN public.bulk_job_rows.payload IS
  'The uploaded row. Cleared to an empty object as soon as the row succeeds, because it holds personal data about people who may have no account here.';
