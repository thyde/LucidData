-- LD-202 source health and field provenance.
--
-- Once records arrive by themselves, "where did this come from and when" stops
-- being a curiosity and becomes the difference between trusting a number and
-- ignoring it. Three columns answer it.
--
-- They are unencrypted metadata, which is the whole reason for the CHECK
-- constraints below. A provider slug and an opaque provider identifier are
-- safe to store in the clear. A free-text note, an activity name, a note field,
-- or anything with a space in it is not, and the database refuses it rather
-- than trusting every future caller to remember.

ALTER TABLE public.vault_data
  ADD COLUMN IF NOT EXISTS source_provider TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS source_captured_at TIMESTAMPTZ;

COMMENT ON COLUMN public.vault_data.source_provider IS
  'LD-202 provider slug for an imported entry, for example strava. Unencrypted metadata, so it must stay opaque.';

COMMENT ON COLUMN public.vault_data.source_record_id IS
  'LD-202 the provider''s own identifier for the record. Opaque by constraint: no whitespace, no free text.';

COMMENT ON COLUMN public.vault_data.source_captured_at IS
  'LD-202 when the provider recorded the event, as distinct from when we imported it.';

-- A slug, not a sentence.
ALTER TABLE public.vault_data
  DROP CONSTRAINT IF EXISTS vault_data_source_provider_opaque;
ALTER TABLE public.vault_data
  ADD CONSTRAINT vault_data_source_provider_opaque
  CHECK (source_provider IS NULL OR source_provider ~ '^[a-z0-9][a-z0-9_-]{0,39}$');

-- An identifier, not a label. The character class is deliberately narrow:
-- it admits every identifier shape providers actually use and admits no prose.
ALTER TABLE public.vault_data
  DROP CONSTRAINT IF EXISTS vault_data_source_record_id_opaque;
ALTER TABLE public.vault_data
  ADD CONSTRAINT vault_data_source_record_id_opaque
  CHECK (source_record_id IS NULL OR source_record_id ~ '^[A-Za-z0-9._:@=-]{1,128}$');

-- A record id without a provider is meaningless, and a provider that arrives
-- without a record id cannot be de-duplicated. Require them together.
ALTER TABLE public.vault_data
  DROP CONSTRAINT IF EXISTS vault_data_source_pair;
ALTER TABLE public.vault_data
  ADD CONSTRAINT vault_data_source_pair
  CHECK (source_record_id IS NULL OR source_provider IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_vault_source
  ON public.vault_data(user_id, source_provider)
  WHERE source_provider IS NOT NULL;

-- The same record must not land twice, whether from a re-run sync or a manual
-- re-import. pending_ingest already guards the queue; this guards the vault.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_source_record_unique
  ON public.vault_data(user_id, source_provider, source_record_id)
  WHERE source_provider IS NOT NULL AND source_record_id IS NOT NULL;

-- Coverage for the source health panel.
--
-- Reads three metadata columns and counts rows. It never touches
-- client_ciphertext, so it cannot leak content even if it were called with the
-- wrong argument. It exists as a function rather than a client-side aggregate
-- so the settings page is one round trip instead of scanning every vault row.
CREATE OR REPLACE FUNCTION public.vault_source_coverage(p_user_id UUID)
RETURNS TABLE (
  provider TEXT,
  record_count BIGINT,
  first_captured_at TIMESTAMPTZ,
  last_captured_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    v.source_provider,
    COUNT(*),
    MIN(v.source_captured_at),
    MAX(v.source_captured_at)
  FROM public.vault_data v
  WHERE v.user_id = p_user_id
    AND v.source_provider IS NOT NULL
  GROUP BY v.source_provider;
$$;

-- Revoking from PUBLIC strips service_role too, so the grant has to follow.
REVOKE EXECUTE ON FUNCTION public.vault_source_coverage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_source_coverage(UUID) TO service_role;

COMMENT ON FUNCTION public.vault_source_coverage(UUID) IS
  'LD-202 per-provider record count and capture range for the source health panel. Metadata only.';
