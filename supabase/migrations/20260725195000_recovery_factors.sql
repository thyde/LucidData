-- LD-105 recovery hardening.
--
-- Zero knowledge is the right architecture, and it makes recovery enrollment a
-- safety issue rather than a preference: a user who forgets their password and
-- never saved a recovery code loses their vault permanently, and nobody can
-- help them.
--
-- This adds independent recovery factors (more than one may exist), an explicit
-- informed decline, and a periodic confirmation timestamp.

CREATE TABLE IF NOT EXISTS public.recovery_factors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('recovery_code', 'recovery_kit')),
  label TEXT NOT NULL,
  -- The master key wrapped by a key derived from the factor secret. The server
  -- never holds the secret, so it can never unwrap this.
  wrapped_master_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ
);
ALTER TABLE public.recovery_factors ENABLE ROW LEVEL SECURITY;

-- Owners manage their own factors. Nobody else can read them, and even reading
-- them yields only wrapped bytes.
CREATE POLICY "recovery_factors_all_own" ON public.recovery_factors
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_recovery_factors_user
  ON public.recovery_factors(user_id, created_at DESC);

-- One recovery code factor at a time: generating a new code replaces the old.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_factors_single_code
  ON public.recovery_factors(user_id)
  WHERE type = 'recovery_code';

ALTER TABLE public.users
  -- Set when the user explicitly accepted that their data will be unrecoverable.
  ADD COLUMN IF NOT EXISTS recovery_setup_declined_at TIMESTAMPTZ,
  -- Last time the user confirmed they still hold a working factor.
  ADD COLUMN IF NOT EXISTS recovery_last_confirmed_at TIMESTAMPTZ;
