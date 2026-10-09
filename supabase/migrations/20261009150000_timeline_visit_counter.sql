-- LD-214: how often people open the health timeline, as one number a day.
--
-- The timeline is built in the browser from entries the server cannot read,
-- and signed-in pages stay out of page analytics, so this counter is the only
-- record that it is used. A row holds a day, the counter's name, and a count:
-- no person, no metric, no date range, no value. The browser counts a person
-- once a day, and the server only adds one.

CREATE TABLE public.daily_counters (
  day DATE NOT NULL,
  counter TEXT NOT NULL CHECK (counter IN ('timeline_visit')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, counter)
);

-- Service role only: the server adds to a counter, and product_metrics reads
-- them. Row level security is on with no policy.
ALTER TABLE public.daily_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_daily_counter(p_counter TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.daily_counters (day, counter, count)
  VALUES ((NOW() AT TIME ZONE 'UTC')::date, p_counter, 1)
  ON CONFLICT (day, counter) DO UPDATE SET count = public.daily_counters.count + 1;
$$;

-- Revoke-then-grant: REVOKE FROM PUBLIC also strips service_role.
REVOKE ALL ON FUNCTION public.increment_daily_counter(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_counter(TEXT) TO service_role;

-- product_metrics as in 20261006120000_product_metrics.sql, with timeline visits
-- added.
CREATE OR REPLACE FUNCTION public.product_metrics(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH
  cohort AS (
    SELECT u.id, u.created_at, COALESCE(u.signup_source, 'direct') AS source
    FROM public.users u
    WHERE u.created_at >= p_from AND u.created_at < p_to
  ),
  first_record AS (
    SELECT c.id, MIN(v.created_at) - c.created_at AS took
    FROM cohort c
    JOIN public.vault_data v ON v.user_id = c.id
    GROUP BY c.id, c.created_at
  ),
  sources_by_day7 AS (
    SELECT c.id, COUNT(DISTINCT s.provider) AS providers
    FROM cohort c
    JOIN public.data_sources s
      ON s.user_id = c.id AND s.created_at <= c.created_at + INTERVAL '7 days'
    GROUP BY c.id
  ),
  shares AS (
    SELECT a.user_id, a."timestamp" AS created_at
    FROM public.audit_logs a
    WHERE a.event_type IN ('consent_granted', 'credential_shared')
  ),
  first_share AS (
    SELECT user_id, MIN(created_at) AS first_at
    FROM shares
    GROUP BY user_id
    HAVING MIN(created_at) >= p_from AND MIN(created_at) < p_to
  ),
  repeat_share AS (
    SELECT f.user_id
    FROM first_share f
    JOIN shares s ON s.user_id = f.user_id
      AND s.created_at > f.first_at
      AND s.created_at <= f.first_at + INTERVAL '30 days'
    GROUP BY f.user_id
  ),
  requests AS (
    SELECT status FROM public.consent_requests
    WHERE requested_at >= p_from AND requested_at < p_to
  ),
  grants AS (
    SELECT revoked FROM public.consents
    WHERE created_at >= p_from AND created_at < p_to
  ),
  issuing AS (
    SELECT organization_id, COUNT(*) AS issued
    FROM public.issued_credentials
    WHERE created_at < p_to
    GROUP BY organization_id
    HAVING COUNT(*) FILTER (WHERE created_at >= p_from) > 0
  ),
  buying AS (
    SELECT buyer_org_id, COUNT(DISTINCT pool_id) AS pools
    FROM public.data_orders
    WHERE status = 'paid' AND created_at < p_to
    GROUP BY buyer_org_id
    HAVING COUNT(*) FILTER (WHERE created_at >= p_from) > 0
  ),
  evaluators AS (
    SELECT DISTINCT organization_id FROM public.pool_evaluations
    WHERE evaluated_at >= p_from AND evaluated_at < p_to
  ),
  -- Sources connected before the period ended and still connected now. A
  -- disconnect cannot be replayed, so this is the closest stable reading.
  connected AS (
    SELECT user_id, COUNT(DISTINCT provider) AS providers
    FROM public.data_sources
    WHERE status = 'connected' AND created_at < p_to
    GROUP BY user_id
  ),
  history AS (
    SELECT user_id,
      EXTRACT(EPOCH FROM MAX(source_captured_at) - MIN(source_captured_at)) / 86400 AS days
    FROM public.vault_data
    WHERE source_captured_at IS NOT NULL AND created_at < p_to
    GROUP BY user_id
  ),
  -- A refreshed session does not move last_sign_in_at, so someone who stays
  -- signed in for a month would look like they never came back. Anything they
  -- did themselves on or after day thirty counts as a return too.
  returned AS (
    SELECT c.source,
      (COALESCE(a.last_sign_in_at >= c.created_at + INTERVAL '30 days', false)
        OR EXISTS (
          SELECT 1 FROM public.audit_logs l
          WHERE l.user_id = c.id
            AND l.actor_type = 'user'
            AND l."timestamp" >= c.created_at + INTERVAL '30 days'
        )) AS came_back
    FROM cohort c
    JOIN auth.users a ON a.id = c.id
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'signups', (SELECT COUNT(*) FROM cohort),
    'signups_by_source', COALESCE((
      SELECT jsonb_object_agg(source, n) FROM (
        SELECT source, COUNT(*) AS n FROM cohort GROUP BY source
      ) t), '{}'::jsonb),
    'first_record', jsonb_build_object(
      'people', (SELECT COUNT(*) FROM first_record),
      'median_hours', (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM took)) / 3600)::numeric, 1) FROM first_record)
    ),
    'connected_source_by_day7', jsonb_build_object(
      'people', (SELECT COUNT(*) FROM sources_by_day7),
      'share', (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE
        ROUND((SELECT COUNT(*) FROM sources_by_day7)::numeric / COUNT(*), 3) END FROM cohort)
    ),
    'consent_requests', jsonb_build_object(
      'received', (SELECT COUNT(*) FROM requests),
      'approved', (SELECT COUNT(*) FROM requests WHERE status = 'approved'),
      'denied', (SELECT COUNT(*) FROM requests WHERE status = 'denied'),
      'completion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE
        ROUND(COUNT(*) FILTER (WHERE status IN ('approved', 'denied'))::numeric / COUNT(*), 3) END
        FROM requests)
    ),
    'consents', jsonb_build_object(
      'granted', (SELECT COUNT(*) FROM grants),
      'revoked', (SELECT COUNT(*) FROM grants WHERE revoked),
      'revocation_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE
        ROUND(COUNT(*) FILTER (WHERE revoked)::numeric / COUNT(*), 3) END FROM grants)
    ),
    'repeat_sharing_30d', jsonb_build_object(
      'first_time_sharers', (SELECT COUNT(*) FROM first_share),
      'shared_again', (SELECT COUNT(*) FROM repeat_share)
    ),
    'payouts_paid_cents', (SELECT COALESCE(SUM(amount_cents), 0) FROM public.payouts
      WHERE status = 'paid' AND updated_at >= p_from AND updated_at < p_to),
    'payouts_accrued_cents', (SELECT COALESCE(SUM(amount_cents), 0) FROM public.payouts
      WHERE status IN ('pending', 'held') AND created_at < p_to),
    'organization_reuse', jsonb_build_object(
      'issuing_orgs', (SELECT COUNT(*) FROM issuing),
      'issued_second_credential', (SELECT COUNT(*) FROM issuing WHERE issued >= 2),
      'buying_orgs', (SELECT COUNT(*) FROM buying),
      'bought_second_pool', (SELECT COUNT(*) FROM buying WHERE pools >= 2)
    ),
    'buyer_conversion', jsonb_build_object(
      'evaluating_orgs', (SELECT COUNT(*) FROM evaluators),
      'purchasing_orgs', (SELECT COUNT(*) FROM evaluators e
        WHERE EXISTS (SELECT 1 FROM public.data_orders o
          WHERE o.buyer_org_id = e.organization_id AND o.status = 'paid'
            AND o.created_at >= p_from AND o.created_at < p_to))
    ),
    'credential_presentations', (SELECT COUNT(*) FROM public.audit_logs
      WHERE event_type = 'credential_share_viewed'
        AND "timestamp" >= p_from AND "timestamp" < p_to),
    -- The extension sends nothing to us, so installs come from the store
    -- dashboards. Saving a tracker summary is the one tier 1 step that leaves a
    -- trace, and only the schema type is read, never the content.
    'tracker_summaries_saved', (SELECT COUNT(DISTINCT user_id) FROM public.vault_data
      WHERE schema_type = 'browsing_insight'
        AND created_at >= p_from AND created_at < p_to),
    'health_sources', jsonb_build_object(
      'people_connected', (SELECT COUNT(*) FROM connected),
      'mean_sources_per_person', (SELECT ROUND(AVG(providers), 2) FROM connected),
      'median_days_of_history', (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY days))::numeric, 1) FROM history)
    ),
    -- LD-214: the browser counts a person once a day when they open the health
    -- timeline. Only the day's total is kept, with nothing about who or what.
    'timeline_visits', jsonb_build_object(
      'total', (SELECT COALESCE(SUM(count), 0) FROM public.daily_counters
        WHERE counter = 'timeline_visit' AND day >= p_from::date AND day < p_to::date),
      'per_week', (SELECT ROUND(COALESCE(SUM(count), 0)::numeric * 7
          / GREATEST(1, p_to::date - p_from::date), 1)
        FROM public.daily_counters
        WHERE counter = 'timeline_visit' AND day >= p_from::date AND day < p_to::date)
    ),
    'retention_30d_by_source', COALESCE((
      SELECT jsonb_object_agg(source, jsonb_build_object('people', people, 'returned', returned)) FROM (
        SELECT source, COUNT(*) AS people, COUNT(*) FILTER (WHERE came_back) AS returned
        FROM returned
        GROUP BY source
      ) t), '{}'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.product_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
