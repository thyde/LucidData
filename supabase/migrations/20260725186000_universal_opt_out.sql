-- LD-302 universal opt-out signal (Global Privacy Control).
--
-- California recognises GPC, and several state laws require honouring a
-- universal opt-out mechanism. When a signal is seen we record it once, and it
-- suppresses any sale or sharing of the person's data before it can begin.
--
-- The user can still opt in explicitly afterwards. That is recorded separately
-- so a deliberate override is never confused with an absent signal.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS universal_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS universal_opt_out_source TEXT,
  ADD COLUMN IF NOT EXISTS universal_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS universal_opt_out_override_at TIMESTAMPTZ;
