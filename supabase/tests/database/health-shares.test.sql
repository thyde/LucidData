-- LD-305: a health summary shared by link. Only the server writes one, its
-- owner reads it without the ciphertext, revoking its consent clears the
-- ciphertext however that happens, its terms never change, and the link opens
-- it only while it is neither revoked nor expired.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000005a1', 'sharer@example.com'),
  ('00000000-0000-4000-8000-0000000005a2', 'someone-else@example.com');

INSERT INTO public.consents (id, user_id, granted_to, granted_to_name, access_level, purpose, data_category, end_date) VALUES
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d1', 'Dr. Patel', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days'),
  ('00000000-0000-4000-8000-0000000005c2', '00000000-0000-4000-8000-0000000005a1',
   'org-1', 'Some clinic', 'read', 'Appointments', 'health', now() + interval '7 days'),
  ('00000000-0000-4000-8000-0000000005c3', '00000000-0000-4000-8000-0000000005a2',
   'link:00000000-0000-4000-8000-0000000005d3', 'Coach', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days'),
  ('00000000-0000-4000-8000-0000000005c4', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d4', 'Physio', 'export', 'Health summary shared by link', 'health',
   now() - interval '1 day');

-- 1. Who may touch the table ------------------------------------------------------

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.health_shares'::regclass),
  'Row level security is on'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.health_shares', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.health_shares', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.health_shares', 'DELETE')
    AND NOT has_any_column_privilege('anon', 'public.health_shares', 'SELECT')
    AND NOT has_column_privilege('authenticated', 'public.health_shares', 'ciphertext', 'SELECT'),
  'Only the server writes shares, and nobody reads the ciphertext through the API'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.open_health_share(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.open_health_share(uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.open_health_share(uuid)', 'EXECUTE'),
  'Only the server opens a share'
);

-- 2. What a share must be ---------------------------------------------------------

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c1', 'c2VhbGVk', ARRAY['steps', 'sleep_hours'],
             '2026-09-01', '2026-09-30', now() + interval '7 days') $$,
  'The server stores a share against its consent'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005c3', 'c2VhbGVk',
             ARRAY['steps'], '2026-09-01', '2026-09-30', now() + interval '7 days') $$,
  '23503',
  NULL,
  'A share cannot stand on someone else''s consent'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005c2', 'c2VhbGVk',
             ARRAY['steps'], '2026-09-01', '2026-09-30', now() + interval '40 days') $$,
  '23514',
  NULL,
  'A share expires within a month'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005c2', 'c2VhbGVk',
             ARRAY['steps'], '2025-01-01', '2026-09-30', now() + interval '7 days') $$,
  '23514',
  NULL,
  'A share covers a year at most'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005c2', '',
             ARRAY['steps'], '2026-09-01', '2026-09-30', now() + interval '7 days') $$,
  '23514',
  NULL,
  'A share holds something'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at, revoked_at)
     VALUES ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005c2', 'c2VhbGVk',
             ARRAY['steps'], '2026-09-01', '2026-09-30', now() + interval '7 days', now()) $$,
  '23514',
  NULL,
  'A revoked share holds no ciphertext'
);

-- An expired share, made before the test's clock.
INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, created_at, expires_at)
VALUES ('00000000-0000-4000-8000-0000000005d4', '00000000-0000-4000-8000-0000000005a1',
        '00000000-0000-4000-8000-0000000005c4', 'c2VhbGVk', ARRAY['weight_kg'],
        '2026-08-01', '2026-08-31', now() - interval '8 days', now() - interval '1 day');

-- 3. Opening a share --------------------------------------------------------------

SELECT results_eq(
  $$ SELECT state, ciphertext, previous_view_at IS NULL FROM public.open_health_share('00000000-0000-4000-8000-0000000005d1') $$,
  $$ VALUES ('open'::text, 'c2VhbGVk'::text, true) $$,
  'An open share returns its ciphertext'
);

SELECT results_eq(
  $$ SELECT state, previous_view_at IS NOT NULL FROM public.open_health_share('00000000-0000-4000-8000-0000000005d1') $$,
  $$ VALUES ('open'::text, true) $$,
  'A second view knows when the first was'
);

SELECT is(
  (SELECT view_count FROM public.health_shares WHERE id = '00000000-0000-4000-8000-0000000005d1'),
  2,
  'Every view is counted'
);

SELECT results_eq(
  $$ SELECT state, ciphertext FROM public.open_health_share('00000000-0000-4000-8000-0000000005d4') $$,
  $$ VALUES ('expired'::text, NULL::text) $$,
  'An expired share does not open'
);

SELECT results_eq(
  $$ SELECT state, ciphertext FROM public.open_health_share('00000000-0000-4000-8000-0000000005ff') $$,
  $$ VALUES ('missing'::text, NULL::text) $$,
  'A share that does not exist says so'
);

RESET ROLE;

-- 4. What the owner can do --------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000005a1", "role": "authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.health_shares),
  2,
  'A person reads their own shares'
);

SELECT throws_ok(
  $$ SELECT ciphertext FROM public.health_shares $$,
  '42501',
  NULL,
  'A person cannot read the ciphertext'
);

SELECT throws_ok(
  $$ UPDATE public.consents SET end_date = end_date + interval '30 days'
     WHERE id = '00000000-0000-4000-8000-0000000005c1' $$,
  '23514',
  NULL,
  'A shared summary cannot be extended'
);

SELECT throws_ok(
  $$ UPDATE public.consents SET purpose = 'Something else'
     WHERE id = '00000000-0000-4000-8000-0000000005c1' $$,
  '23514',
  NULL,
  'A shared summary keeps its terms'
);

SELECT lives_ok(
  $$ UPDATE public.consents SET end_date = end_date + interval '30 days'
     WHERE id = '00000000-0000-4000-8000-0000000005c2' $$,
  'Other grants can still be extended'
);

SELECT lives_ok(
  $$ UPDATE public.consents SET revoked = true, revoked_at = now(), revoked_reason = 'Done'
     WHERE id = '00000000-0000-4000-8000-0000000005c1' $$,
  'A person revokes the consent behind a share'
);

SELECT throws_ok(
  $$ UPDATE public.consents SET revoked = false WHERE id = '00000000-0000-4000-8000-0000000005c1' $$,
  '23514',
  NULL,
  'A revoked share stays revoked'
);

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000005a2", "role": "authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.health_shares),
  0,
  'Nobody else reads them'
);

RESET ROLE;

-- 5. After revocation -------------------------------------------------------------

SELECT results_eq(
  $$ SELECT ciphertext IS NULL, revoked_at IS NOT NULL FROM public.health_shares
     WHERE id = '00000000-0000-4000-8000-0000000005d1' $$,
  $$ VALUES (true, true) $$,
  'Revoking the consent deletes the ciphertext'
);

SET LOCAL ROLE service_role;

SELECT results_eq(
  $$ SELECT state, ciphertext FROM public.open_health_share('00000000-0000-4000-8000-0000000005d1') $$,
  $$ VALUES ('revoked'::text, NULL::text) $$,
  'A revoked share does not open'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
