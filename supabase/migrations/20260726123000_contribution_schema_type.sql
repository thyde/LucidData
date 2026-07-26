-- LD-501 schema type on contributions.
--
-- The privacy gate classifies fields per schema (medical_basic, employment,
-- fitness_daily, and so on). pool_contributions only recorded the broad data
-- category (health, credentials, interests), which is not enough to know
-- whether a field is a name, a birth date, or a step count.
--
-- Without this, every field would be unclassified, and unclassified fails
-- closed, so no release could ever pass the gate.

ALTER TABLE public.pool_contributions
  ADD COLUMN IF NOT EXISTS schema_type TEXT;

COMMENT ON COLUMN public.pool_contributions.schema_type IS
  'LD-501 the vault schema the payload came from. Drives field classification. NULL means unclassifiable, and unclassifiable is suppressed from every release.';

-- Backfill from the vault entry where the link still exists.
UPDATE public.pool_contributions AS c
SET schema_type = v.schema_type
FROM public.vault_data AS v
WHERE c.vault_data_id = v.id
  AND c.schema_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_pool_contributions_schema_type
  ON public.pool_contributions(schema_type)
  WHERE schema_type IS NOT NULL;
