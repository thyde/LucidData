-- LD-112: open the vault with a passkey.
--
-- A passkey that supports the WebAuthn PRF extension can produce a secret
-- only it can make, and the browser wraps a copy of the master key with a key
-- derived from it, as a recovery kit does. The server stores the wrapped copy
-- and the PRF input, neither of which opens anything without the passkey.
--
-- The factor lives in recovery_factors, bound to the passkey it belongs to,
-- and goes when the passkey goes: removing a passkey removes its way into the
-- vault in the same statement.

ALTER TABLE public.recovery_factors
  DROP CONSTRAINT recovery_factors_type_check,
  ADD CONSTRAINT recovery_factors_type_check
    CHECK (type IN ('recovery_code', 'recovery_kit', 'passkey_prf')),
  ADD COLUMN passkey_id uuid REFERENCES public.passkeys(id) ON DELETE CASCADE,
  -- A passkey factor names its passkey, and nothing else does.
  ADD CONSTRAINT recovery_factors_passkey_bound
    CHECK ((type = 'passkey_prf') = (passkey_id IS NOT NULL));

-- One way into the vault per passkey.
CREATE UNIQUE INDEX idx_recovery_factors_passkey
  ON public.recovery_factors(passkey_id)
  WHERE passkey_id IS NOT NULL;

COMMENT ON COLUMN public.recovery_factors.passkey_id IS
  'For a passkey_prf factor, the passkey whose PRF output wraps this copy of the master key. Deleting the passkey deletes the factor.';
