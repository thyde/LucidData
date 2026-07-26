-- Re-wrap all Vault DEKs in one transaction. Password-change and recovery flows
-- must never leave a user with a partially migrated set of key envelopes.
CREATE OR REPLACE FUNCTION public.rewrap_vault_entries_atomic(entries JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  expected_count INTEGER;
  supplied_count INTEGER;
  distinct_count INTEGER;
  entry JSONB;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF jsonb_typeof(entries) <> 'array' THEN
    RAISE EXCEPTION 'Entries must be an array';
  END IF;

  SELECT COUNT(*) INTO expected_count
  FROM public.vault_data
  WHERE user_id = current_user_id;

  supplied_count := jsonb_array_length(entries);
  SELECT COUNT(DISTINCT value->>'id') INTO distinct_count
  FROM jsonb_array_elements(entries);

  IF supplied_count <> expected_count OR distinct_count <> expected_count THEN
    RAISE EXCEPTION 'Every vault entry must be supplied exactly once';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(entries)
  LOOP
    IF COALESCE(entry->>'encrypted_dek', '') = '' OR COALESCE(entry->>'dek_salt', '') = '' THEN
      RAISE EXCEPTION 'Encrypted DEK and salt are required';
    END IF;

    UPDATE public.vault_data
    SET encrypted_dek = entry->>'encrypted_dek',
        dek_salt = entry->>'dek_salt',
        updated_at = NOW()
    WHERE id = (entry->>'id')::UUID
      AND user_id = current_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vault entry not found or not owned by the current user';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.rewrap_vault_entries_atomic(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rewrap_vault_entries_atomic(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.rewrap_vault_entries_atomic(JSONB) TO authenticated;