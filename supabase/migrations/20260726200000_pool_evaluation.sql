-- LD-503 pool evaluation aggregates.
--
-- A buyer should be able to inspect a dataset before committing, but a preview
-- built from real records leaks, and small pools leak hardest. These functions
-- return counts only. No contributed value ever crosses the boundary into
-- application code, which is a stronger guarantee than reading rows and
-- promising to discard the values.

-- How many contributions carry each field. Keys only: jsonb_object_keys never
-- touches a value.
CREATE OR REPLACE FUNCTION public.pool_field_coverage(p_pool_id UUID)
RETURNS TABLE (field TEXT, present BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT k.key AS field, COUNT(*) AS present
  FROM public.pool_contributions c
  CROSS JOIN LATERAL jsonb_object_keys(c.anonymized_payload) AS k(key)
  WHERE c.pool_id = p_pool_id
    AND c.status = 'active'
  GROUP BY k.key
  ORDER BY k.key;
$$;

-- Age distribution of the live contributions, in buckets. Buckets rather than
-- timestamps, because an exact contribution time is a quasi-identifier.
CREATE OR REPLACE FUNCTION public.pool_freshness(p_pool_id UUID)
RETURNS TABLE (bucket TEXT, records BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN NOW() - c.created_at < INTERVAL '7 days' THEN 'under_7_days'
      WHEN NOW() - c.created_at < INTERVAL '30 days' THEN 'under_30_days'
      WHEN NOW() - c.created_at < INTERVAL '90 days' THEN 'under_90_days'
      WHEN NOW() - c.created_at < INTERVAL '365 days' THEN 'under_1_year'
      ELSE 'over_1_year'
    END AS bucket,
    COUNT(*) AS records
  FROM public.pool_contributions c
  WHERE c.pool_id = p_pool_id
    AND c.status = 'active'
  GROUP BY 1;
$$;

-- Which vault schemas the pool has drawn from, and how many records each
-- produced. Drives the synthetic sample the buyer is shown.
CREATE OR REPLACE FUNCTION public.pool_schema_mix(p_pool_id UUID)
RETURNS TABLE (schema_type TEXT, records BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(c.schema_type, 'unclassified') AS schema_type, COUNT(*) AS records
  FROM public.pool_contributions c
  WHERE c.pool_id = p_pool_id
    AND c.status = 'active'
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

-- Reachable through the service role only. Evaluation runs behind organization
-- membership in application code, and a direct RPC would let anyone with an
-- anon key enumerate coverage for any pool id they can guess.
--
-- Revoking from PUBLIC removes the default grant from every role, including
-- service_role, so the grant below is not redundant. Without it the evaluation
-- surface fails with a permission error at runtime rather than at deploy time.
REVOKE EXECUTE ON FUNCTION public.pool_field_coverage(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pool_freshness(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pool_schema_mix(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pool_field_coverage(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.pool_freshness(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.pool_schema_mix(UUID) TO service_role;

COMMENT ON FUNCTION public.pool_field_coverage(UUID) IS
  'LD-503 per-field presence counts. Reads keys, never values.';
