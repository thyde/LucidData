-- LD-610 measures of success: product_metrics must count what the roadmap says
-- it counts, record sign-up source only from an allowlist, and stay closed to
-- the API roles.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

-- Fixtures run as postgres. The window is a fixed past month so no real row
-- can fall inside it.
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, last_sign_in_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'metrics-a@example.com', '{"signup_source": "verify"}', '2020-01-02', '2020-03-01'),
  ('00000000-0000-4000-8000-000000000002', 'metrics-b@example.com', '{"signup_source": "extension"}', '2020-01-03', '2020-01-03'),
  ('00000000-0000-4000-8000-000000000003', 'metrics-c@example.com', '{"signup_source": "admin"}', '2020-01-04', NULL),
  ('00000000-0000-4000-8000-000000000004', 'metrics-d@example.com', '{}', '2020-01-05', NULL);

-- The trigger stamps public.users.created_at with now(); align it with the
-- fixture sign-up times so the cohort window applies.
UPDATE public.users u SET created_at = a.created_at
FROM auth.users a WHERE a.id = u.id AND a.email LIKE 'metrics-%@example.com';

SELECT is(
  (SELECT signup_source FROM public.users WHERE email = 'metrics-a@example.com'),
  'verify', 'An allowed sign-up source is recorded'
);
SELECT is(
  (SELECT signup_source FROM public.users WHERE email = 'metrics-c@example.com'),
  'direct', 'A value outside the allowlist is recorded as direct'
);
SELECT is(
  (SELECT signup_source FROM public.users WHERE email = 'metrics-d@example.com'),
  'direct', 'No value is recorded as direct'
);

UPDATE auth.users SET raw_user_meta_data = '{"signup_source": "invite"}'
WHERE email = 'metrics-a@example.com';
SELECT is(
  (SELECT signup_source FROM public.users WHERE email = 'metrics-a@example.com'),
  'verify', 'A later metadata change does not rewrite the recorded source'
);

-- First records: A after 2 hours, B after 10 hours. C and D never.
INSERT INTO public.vault_data (user_id, label, client_ciphertext, encrypted_dek, dek_salt, created_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'x', 'c', 'd', 's', '2020-01-02 02:00'),
  ('00000000-0000-4000-8000-000000000002', 'x', 'c', 'd', 's', '2020-01-03 10:00');

-- A connects a source on day 2; B connects on day 9, outside the 7-day window.
INSERT INTO public.data_sources (user_id, provider, created_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'strava', '2020-01-04'),
  ('00000000-0000-4000-8000-000000000002', 'strava', '2020-01-12');

-- A shares twice within 30 days; B once. Sharing is read from the audit log,
-- because share rows are purged and audit rows are not.
INSERT INTO public.consents (user_id, granted_to, access_level, purpose, start_date, created_at, revoked) VALUES
  ('00000000-0000-4000-8000-000000000001', 'org-x', 'read', 'test', '2020-01-06', '2020-01-06', false),
  ('00000000-0000-4000-8000-000000000001', 'org-y', 'read', 'test', '2020-01-20', '2020-01-20', true),
  ('00000000-0000-4000-8000-000000000002', 'org-x', 'read', 'test', '2020-01-07', '2020-01-07', false);

INSERT INTO public.audit_logs (user_id, event_type, action, actor_type, current_hash, "timestamp") VALUES
  ('00000000-0000-4000-8000-000000000001', 'consent_granted', 'x', 'user', 'h1', '2020-01-06'),
  ('00000000-0000-4000-8000-000000000001', 'credential_shared', 'x', 'user', 'h2', '2020-01-20'),
  ('00000000-0000-4000-8000-000000000002', 'consent_granted', 'x', 'user', 'h3', '2020-01-07'),
  -- Two verifier views of a shared credential.
  ('00000000-0000-4000-8000-000000000001', 'credential_share_viewed', 'x', 'system', 'h4', '2020-01-21'),
  ('00000000-0000-4000-8000-000000000001', 'credential_share_viewed', 'x', 'system', 'h5', '2020-01-22'),
  -- B never signs in again, but acts on day 40: that is a return.
  ('00000000-0000-4000-8000-000000000002', 'vault_read', 'x', 'user', 'h6', '2020-02-12'),
  -- C is touched only by the system after day 30: that is not.
  ('00000000-0000-4000-8000-000000000003', 'consent_expired', 'x', 'system', 'h7', '2020-03-01');

-- B saves a tracker summary from the extension. Only the schema type is read.
INSERT INTO public.vault_data (user_id, label, schema_type, client_ciphertext, encrypted_dek, dek_salt, created_at) VALUES
  ('00000000-0000-4000-8000-000000000002', 'x', 'browsing_insight', 'c', 'd', 's', '2020-01-15');

CREATE TEMP TABLE m AS
SELECT public.product_metrics('2020-01-01', '2020-02-01') AS j;

SELECT is((SELECT (j ->> 'signups')::int FROM m), 4, 'Counts the sign-up cohort');
SELECT is(
  (SELECT j -> 'signups_by_source' FROM m),
  '{"direct": 2, "verify": 1, "extension": 1}'::jsonb,
  'Breaks sign-ups down by source'
);
SELECT is((SELECT (j -> 'first_record' ->> 'people')::int FROM m), 2, 'Counts people with a first record');
SELECT is((SELECT (j -> 'first_record' ->> 'median_hours')::numeric FROM m), 6.0, 'Median time to first record');
SELECT is((SELECT (j -> 'connected_source_by_day7' ->> 'people')::int FROM m), 1, 'Only sources connected within seven days count');
SELECT is((SELECT (j -> 'connected_source_by_day7' ->> 'share')::numeric FROM m), 0.250, 'Share connected by day seven');
SELECT is((SELECT (j -> 'consents' ->> 'revocation_rate')::numeric FROM m), 0.333, 'Revocation rate over grants in the window');
SELECT is((SELECT (j -> 'repeat_sharing_30d' ->> 'first_time_sharers')::int FROM m), 2, 'First-time sharers');
SELECT is((SELECT (j -> 'repeat_sharing_30d' ->> 'shared_again')::int FROM m), 1, 'Repeat sharing within thirty days');
SELECT is(
  (SELECT j -> 'retention_30d_by_source' -> 'verify' FROM m),
  '{"people": 1, "returned": 1}'::jsonb,
  'Thirty-day return by sign-up source'
);
SELECT is(
  (SELECT j -> 'retention_30d_by_source' -> 'extension' FROM m),
  '{"people": 1, "returned": 1}'::jsonb,
  'Acting after day thirty counts as a return without a new sign-in'
);
SELECT is(
  (SELECT j -> 'retention_30d_by_source' -> 'direct' FROM m),
  '{"people": 2, "returned": 0}'::jsonb,
  'System activity on an account is not a return'
);
SELECT is((SELECT (j ->> 'credential_presentations')::int FROM m), 2, 'Counts verifier views of shared credentials');
SELECT is((SELECT (j ->> 'tracker_summaries_saved')::int FROM m), 1, 'Counts people who saved a tracker summary');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.product_metrics(timestamptz, timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.product_metrics(timestamptz, timestamptz)', 'EXECUTE'),
  'Metrics are not callable through the API roles'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.pool_evaluations', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.metric_snapshots', 'SELECT'),
  'Metric tables are closed to signed-in users'
);

SELECT * FROM finish();

ROLLBACK;
