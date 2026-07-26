-- LD-601 scheduled job runner.
--
-- Adds the state a periodic runner needs so failed payouts retry with backoff
-- instead of stalling forever, and so consent grants and share tokens record an
-- explicit expiry event rather than only being derived at read time.

-- Payout retry state. A payout stays 'pending' between attempts; next_attempt_at
-- gates when the runner may try again, and attempts drives exponential backoff.
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Scan index for the runner: due pending payouts, oldest first.
CREATE INDEX IF NOT EXISTS idx_payouts_due
  ON public.payouts(status, next_attempt_at)
  WHERE status = 'pending';

-- Explicit expiry markers. NULL means "not yet expired by the runner"; the
-- read-time checks on end_date / expires_at remain authoritative for access.
ALTER TABLE public.consents
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE public.credential_shares
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- Partial indexes so each sweep touches only rows that still need marking.
CREATE INDEX IF NOT EXISTS idx_consents_pending_expiry
  ON public.consents(end_date)
  WHERE expired_at IS NULL AND revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_cs_pending_expiry
  ON public.credential_shares(expires_at)
  WHERE expired_at IS NULL AND revoked = FALSE;

-- Run history. Written by the service role only, so RLS is enabled with no
-- policy: nothing reaches this table through the anon or authenticated roles.
CREATE TABLE IF NOT EXISTS public.job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  processed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_job_runs_job ON public.job_runs(job, started_at DESC);
