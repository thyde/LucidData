-- LD-210: a re-wrap sent in parts and applied at once.
--
-- A password change or a recovery re-wraps every entry's data key on the
-- device, about 300 bytes an entry, and sent them all in one request. Vercel
-- refuses a request body over 4.5 MB, which a vault reaches at about 13,900
-- entries, and a health export import can take a vault past that. From now on
-- the device sends the re-wrap in parts, which wait here, and one call applies
-- them all in a single transaction, so a vault is never left half under each key.
--
-- Both tables are written and read by the service role only, after the account
-- service has consumed a step-up grant for change_password. Row level security
-- is on with no policy, and the API roles hold no privileges on either.

CREATE TABLE public.vault_rewraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('password_change', 'recovery')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
);

CREATE INDEX idx_vault_rewraps_user ON public.vault_rewraps(user_id);

CREATE TABLE public.vault_rewrap_entries (
  rewrap_id UUID NOT NULL REFERENCES public.vault_rewraps(id) ON DELETE CASCADE,
  vault_data_id UUID NOT NULL,
  encrypted_dek TEXT NOT NULL CHECK (encrypted_dek <> ''),
  dek_salt TEXT NOT NULL CHECK (dek_salt <> ''),
  previous_encrypted_dek TEXT NOT NULL CHECK (previous_encrypted_dek <> ''),
  PRIMARY KEY (rewrap_id, vault_data_id)
);

ALTER TABLE public.vault_rewraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_rewrap_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vault_rewraps, public.vault_rewrap_entries FROM anon, authenticated;

-- Apply a staged re-wrap. Every entry the person holds must have exactly one
-- staged envelope, and each envelope replaces only the wrapped key the device
-- read, so an entry added, removed, or edited since refuses the whole re-wrap
-- with PT409, which PostgREST answers as 409 without retrying. A re-wrap that
-- has expired or belongs to someone else is refused with PT410. On success the
-- staged rows are deleted and the number of entries re-wrapped is returned.
--
-- p_ingest_key carries the connector ingestion key as the device read it:
-- {"previous": <the stored wrap, or null when there was none>, "wrapped": <its
-- new wrap, or null to leave it>}. The stored key must still be the one read,
-- null included, so a key published meanwhile under the old master key is not
-- left behind. Omitting p_ingest_key skips that check.
CREATE OR REPLACE FUNCTION public.apply_vault_rewrap(
  p_user_id UUID,
  p_rewrap_id UUID,
  p_ingest_key JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_count INTEGER;
  staged_count INTEGER;
  updated_count INTEGER;
  stored_ingest TEXT;
BEGIN
  IF p_user_id IS NULL OR p_rewrap_id IS NULL THEN
    RAISE EXCEPTION 'A user and a re-wrap are required';
  END IF;

  IF p_ingest_key IS NOT NULL AND (
    jsonb_typeof(p_ingest_key) <> 'object'
    OR (p_ingest_key->>'wrapped' IS NOT NULL AND (p_ingest_key->>'wrapped' = '' OR p_ingest_key->>'previous' IS NULL))
  ) THEN
    RAISE EXCEPTION 'The ingestion key must name the wrap that was read, and a new wrap only for a key that exists';
  END IF;

  -- The person's row first, FOR UPDATE: it is the only row lock that conflicts
  -- with the key-share lock a vault_data insert takes on users for its foreign
  -- key. An insert already under way finishes before the counts below, and one
  -- that starts now waits until this commits, so no entry can appear between
  -- the counts and the update. It also runs two applies for one person in turn.
  SELECT wrapped_ingest_private_key INTO stored_ingest
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The re-wrap has expired or does not exist'
      USING ERRCODE = 'PT410';
  END IF;

  PERFORM 1
  FROM public.vault_rewraps
  WHERE id = p_rewrap_id
    AND user_id = p_user_id
    AND expires_at > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The re-wrap has expired or does not exist'
      USING ERRCODE = 'PT410';
  END IF;

  SELECT COUNT(*) INTO expected_count
  FROM public.vault_data
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO staged_count
  FROM public.vault_rewrap_entries
  WHERE rewrap_id = p_rewrap_id;

  IF staged_count <> expected_count THEN
    RAISE EXCEPTION 'The vault changed after it was read'
      USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.vault_data AS v
  SET encrypted_dek = s.encrypted_dek,
      dek_salt = s.dek_salt,
      updated_at = NOW()
  FROM public.vault_rewrap_entries AS s
  WHERE s.rewrap_id = p_rewrap_id
    AND v.id = s.vault_data_id
    AND v.user_id = p_user_id
    AND v.encrypted_dek = s.previous_encrypted_dek;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- One staged row per entry, so a full count means every entry moved.
  IF updated_count <> expected_count THEN
    RAISE EXCEPTION 'A vault entry changed after it was read'
      USING ERRCODE = 'PT409';
  END IF;

  IF p_ingest_key IS NOT NULL THEN
    IF stored_ingest IS DISTINCT FROM p_ingest_key->>'previous' THEN
      RAISE EXCEPTION 'The ingestion key changed after it was read'
        USING ERRCODE = 'PT409';
    END IF;

    IF p_ingest_key->>'wrapped' IS NOT NULL THEN
      UPDATE public.users
      SET wrapped_ingest_private_key = p_ingest_key->>'wrapped'
      WHERE id = p_user_id;
    END IF;
  END IF;

  DELETE FROM public.vault_rewraps WHERE id = p_rewrap_id;

  RETURN updated_count;
END;
$$;

-- Revoke-then-grant: REVOKE FROM PUBLIC also strips service_role.
REVOKE ALL ON FUNCTION public.apply_vault_rewrap(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vault_rewrap(UUID, UUID, JSONB) TO service_role;
