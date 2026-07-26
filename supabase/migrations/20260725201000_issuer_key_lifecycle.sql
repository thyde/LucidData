-- LD-406 issuer key lifecycle and compromise response.
--
-- Issuer signing keys were created once and never rotated, with no defined
-- response to a compromise. Because every issued credential verifies against the
-- issuer key, a stolen key lets an attacker forge credentials that verify
-- correctly, and the blast radius is every credential that issuer ever issued.
--
-- This adds validity windows, a retired state that keeps old credentials
-- verifiable, and a compromise state that invalidates everything signed after
-- the compromise moment.

ALTER TABLE public.issuer_keys
  -- When this key started being used for signing.
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When it stopped. NULL while active.
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  -- Set only for a compromised key. Signatures dated after this moment fail;
  -- signatures dated before it stay valid but carry a re-check warning.
  ADD COLUMN IF NOT EXISTS compromised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotation_reason TEXT;

-- 'revoked' is kept so existing rows still satisfy the constraint. New states:
--   retired     rotated out normally; past credentials remain valid
--   compromised the private key leaked; post-compromise signatures fail
ALTER TABLE public.issuer_keys
  DROP CONSTRAINT IF EXISTS issuer_keys_status_check;
ALTER TABLE public.issuer_keys
  ADD CONSTRAINT issuer_keys_status_check
  CHECK (status IN ('active', 'revoked', 'retired', 'compromised'));

-- At most one active key per organization, which makes rotation race safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_issuer_keys_single_active
  ON public.issuer_keys(organization_id)
  WHERE status = 'active';

-- Verification resolves a key by its identifier, so this lookup must be fast.
CREATE INDEX IF NOT EXISTS idx_issuer_keys_key_id
  ON public.issuer_keys(key_id);
