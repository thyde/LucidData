-- LD-501 real anonymization guarantees.
--
-- minimum_contributors was the only protection, and a count is not anonymity: a
-- pool of fifty people still identifies someone through a birth date, a
-- postcode, and an employer. These columns carry the k target a pool is held
-- to, the privacy budget it may spend on aggregates, and the report attached to
-- every order so a buyer can see exactly what was generalized and suppressed.

ALTER TABLE public.data_pools
  ADD COLUMN IF NOT EXISTS k_anonymity_target INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS epsilon_budget NUMERIC(10, 4) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS epsilon_spent NUMERIC(10, 4) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'data_pools_k_anonymity_target_check'
  ) THEN
    ALTER TABLE public.data_pools
      ADD CONSTRAINT data_pools_k_anonymity_target_check
      CHECK (k_anonymity_target BETWEEN 2 AND 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'data_pools_epsilon_check'
  ) THEN
    ALTER TABLE public.data_pools
      ADD CONSTRAINT data_pools_epsilon_check
      CHECK (epsilon_budget > 0 AND epsilon_spent >= 0 AND epsilon_spent <= epsilon_budget);
  END IF;
END $$;

COMMENT ON COLUMN public.data_pools.k_anonymity_target IS
  'LD-501 minimum equivalence class size a release must reach. A release that cannot reach it is refused, not warned about.';

COMMENT ON COLUMN public.data_pools.epsilon_spent IS
  'LD-501 differential privacy budget consumed by aggregate answers. Exhaustion blocks further aggregate release.';

-- The report is the buyer's evidence and the contributor's protection: k
-- achieved, fields generalized, records suppressed, identifiers dropped.
ALTER TABLE public.data_orders
  ADD COLUMN IF NOT EXISTS privacy_report JSONB;

COMMENT ON COLUMN public.data_orders.privacy_report IS
  'LD-501 privacy report produced by the release gate. Enough to reproduce the generalization deterministically.';

-- A pool cannot promise fewer contributors than the k it must reach, or the
-- purchase gate would pass a release the privacy gate then refuses.
UPDATE public.data_pools
SET minimum_contributors = k_anonymity_target
WHERE minimum_contributors < k_anonymity_target;
