-- LD-506 marketplace integrity and fraud controls.
--
-- Payouts are real money triggered by self-asserted data. Before this migration
-- nothing stopped the same vault entry being contributed to one pool repeatedly,
-- nothing paused a large transfer for a look, and a buyer had no way to tell
-- whether a pool was backed by anything an issuer vouched for.

-- 1. One vault entry, one active contribution per pool.
--
-- Partial rather than absolute: a withdrawn contribution is a decision the
-- person is entitled to reverse, so re-contributing after withdrawal stays
-- possible. What it stops is the same record counted several times in one
-- release, which inflates both the cohort size and the payout.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_contrib_entry_once
  ON public.pool_contributions(pool_id, user_id, vault_data_id)
  WHERE status = 'active' AND vault_data_id IS NOT NULL;

COMMENT ON INDEX public.uq_pool_contrib_entry_once IS
  'LD-506: the same vault entry cannot be actively contributed to one pool twice.';

-- 2. Payout review holds.
--
-- A transfer above the review threshold stops here rather than leaving. This is
-- the only control in the marketplace that acts after money is owed but before
-- it moves, so it is the last chance to catch a payout that should not go.
ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_status_check;

ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'held', 'paid', 'failed'));

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS held_reason TEXT,
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payouts.held_reason IS
  'LD-506: why this payout is waiting for review. Shown to the contributor, so it must be plain and non-accusatory.';

CREATE INDEX IF NOT EXISTS idx_payouts_held
  ON public.payouts(status, held_at)
  WHERE status = 'held';

-- 3. Supply assurance mix for a pool.
--
-- Splits a pool's active contributions three ways: backed by a credential an
-- organization issued and has not revoked, imported from a connected provider,
-- or typed in by the person. A buyer comparing two pools of the same size
-- should be able to see that difference before paying.
--
-- SECURITY DEFINER because it reads vault_data and issued_credentials rows
-- belonging to many users. It returns counts only, never a value, an identifier,
-- or a payload.
CREATE OR REPLACE FUNCTION public.pool_assurance_mix(p_pool_id UUID)
RETURNS TABLE (
  issuer_vouched BIGINT,
  provider_sourced BIGINT,
  self_asserted BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COUNT(*) FILTER (WHERE c.has_credential)                          AS issuer_vouched,
    COUNT(*) FILTER (WHERE NOT c.has_credential AND c.has_provider)   AS provider_sourced,
    COUNT(*) FILTER (WHERE NOT c.has_credential AND NOT c.has_provider) AS self_asserted
  FROM (
    SELECT
      EXISTS (
        SELECT 1
        FROM public.issued_credentials ic
        WHERE ic.vault_data_id = pc.vault_data_id
          AND ic.status = 'active'
      ) AS has_credential,
      COALESCE(v.source_provider IS NOT NULL, FALSE) AS has_provider
    FROM public.pool_contributions pc
    LEFT JOIN public.vault_data v ON v.id = pc.vault_data_id
    WHERE pc.pool_id = p_pool_id
      AND pc.status = 'active'
  ) c;
$$;

-- Revoke-then-grant is one idiom here: REVOKE ... FROM PUBLIC also strips
-- service_role, so the grant has to follow immediately.
REVOKE EXECUTE ON FUNCTION public.pool_assurance_mix(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pool_assurance_mix(UUID) TO service_role;

COMMENT ON FUNCTION public.pool_assurance_mix(UUID) IS
  'LD-506: counts of issuer-vouched, provider-sourced, and self-asserted contributions in a pool. Counts only.';
