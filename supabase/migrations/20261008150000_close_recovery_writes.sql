-- LD-106: only the services that guard them write the vault's key material.
--
-- The recovery escrow and the recovery factors are the only way back into a
-- vault after a forgotten password. A signed-in session could replace, clear,
-- or add them straight through PostgREST, skipping the step-up check, the
-- audit entry, and the alert the services add. The key salt was already
-- write-once (20261008024818_key_salt_write_once.sql), but a session could
-- still set the first one. The services now write all of these with the
-- service role, filtered to the caller, so the API roles lose write access.

-- 1. users: the key salt and the recovery escrow leave the column grant.
REVOKE UPDATE (key_salt, wrapped_master_key, recovery_code_salt, recovery_codes_generated_at)
  ON public.users FROM anon, authenticated;

-- 2. recovery_factors: a person reads their own, and only the server writes.
REVOKE INSERT, UPDATE, DELETE ON public.recovery_factors FROM anon, authenticated;
DROP POLICY IF EXISTS "recovery_factors_all_own" ON public.recovery_factors;
CREATE POLICY "recovery_factors_select_own" ON public.recovery_factors
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 3. One transaction for every key a password change or a recovery moves.
--
-- rewrap_vault_entries_atomic runs as the caller and writes each envelope by
-- id. It cannot move the connector ingestion key, which the caller's role may
-- not write, and it would overwrite an entry edited on another device between
-- the browser reading it and writing it back. rewrap_vault_keys does both:
-- every envelope and the ingestion key change together or not at all, and each
-- replaces only the exact value the browser re-wrapped. Only the server calls
-- it, after the step-up check, with the caller's id.
CREATE OR REPLACE FUNCTION public.rewrap_vault_keys(
  p_user_id UUID,
  p_entries JSONB,
  p_ingest_key JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_count INTEGER;
  supplied_count INTEGER;
  distinct_count INTEGER;
  entry JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A user is required';
  END IF;

  IF jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Entries must be an array';
  END IF;

  SELECT COUNT(*) INTO expected_count
  FROM public.vault_data
  WHERE user_id = p_user_id;

  supplied_count := jsonb_array_length(p_entries);
  SELECT COUNT(DISTINCT value->>'id') INTO distinct_count
  FROM jsonb_array_elements(p_entries);

  IF supplied_count <> expected_count OR distinct_count <> expected_count THEN
    RAISE EXCEPTION 'Every vault entry must be supplied exactly once';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    IF COALESCE(entry->>'encrypted_dek', '') = ''
      OR COALESCE(entry->>'dek_salt', '') = ''
      OR COALESCE(entry->>'previous_encrypted_dek', '') = ''
    THEN
      RAISE EXCEPTION 'Each entry needs its new encrypted DEK, its salt, and the DEK it replaces';
    END IF;

    UPDATE public.vault_data
    SET encrypted_dek = entry->>'encrypted_dek',
        dek_salt = entry->>'dek_salt',
        updated_at = NOW()
    WHERE id = (entry->>'id')::UUID
      AND user_id = p_user_id
      AND encrypted_dek = entry->>'previous_encrypted_dek';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A vault entry changed after it was read'
        USING ERRCODE = 'serialization_failure';
    END IF;
  END LOOP;

  IF p_ingest_key IS NOT NULL THEN
    UPDATE public.users
    SET wrapped_ingest_private_key = p_ingest_key->>'wrapped'
    WHERE id = p_user_id
      AND wrapped_ingest_private_key = p_ingest_key->>'previous';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The ingestion key changed after it was read'
        USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;
END;
$$;

-- Revoke-then-grant: REVOKE FROM PUBLIC also strips service_role.
REVOKE ALL ON FUNCTION public.rewrap_vault_keys(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewrap_vault_keys(UUID, JSONB, JSONB) TO service_role;
