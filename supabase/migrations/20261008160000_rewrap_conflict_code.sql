-- The re-wrap's compare-and-swap reported a conflict with SQLSTATE 40001,
-- serialization_failure. PostgREST retries a transaction that fails with that
-- code, so a conflict, which fails the same way every time, kept the request
-- waiting until it timed out instead of answering. PT409 is PostgREST's own
-- convention: it answers HTTP 409 and does not retry. The function is
-- otherwise unchanged from 20261008150000_close_recovery_writes.sql.
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
        USING ERRCODE = 'PT409';
    END IF;
  END LOOP;

  IF p_ingest_key IS NOT NULL THEN
    UPDATE public.users
    SET wrapped_ingest_private_key = p_ingest_key->>'wrapped'
    WHERE id = p_user_id
      AND wrapped_ingest_private_key = p_ingest_key->>'previous';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The ingestion key changed after it was read'
        USING ERRCODE = 'PT409';
    END IF;
  END IF;
END;
$$;

-- Revoke-then-grant: REVOKE FROM PUBLIC also strips service_role.
REVOKE ALL ON FUNCTION public.rewrap_vault_keys(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewrap_vault_keys(UUID, JSONB, JSONB) TO service_role;
