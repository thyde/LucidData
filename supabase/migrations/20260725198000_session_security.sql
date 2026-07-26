-- LD-106 session security and step-up authentication.
--
-- Two problems: a live session on an unlocked device was enough for any
-- destructive action, and there was no way to see or end other sessions.
--
-- Step-up tokens are single use and short lived, and each one names the exact
-- action it authorizes, so a confirmation cannot be reused for something else.

CREATE TABLE IF NOT EXISTS public.step_up_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.step_up_grants ENABLE ROW LEVEL SECURITY;

-- Written and consumed by the service role only. A client that could read this
-- table could replay a grant, so there is no policy at all.

CREATE INDEX IF NOT EXISTS idx_step_up_grants_user
  ON public.step_up_grants(user_id, action, expires_at DESC);

-- Sessions the user has ended from another device. The middleware and server
-- code reject a session id listed here even if its refresh token is still valid
-- in the browser.
CREATE TABLE IF NOT EXISTS public.revoked_sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.revoked_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revoked_sessions_select_own" ON public.revoked_sessions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_revoked_sessions_user
  ON public.revoked_sessions(user_id, revoked_at DESC);
