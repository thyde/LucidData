-- LD-305: a health summary shared by link. Only the server writes one, it
-- stands on the consent made for it, its owner reads it without the
-- ciphertext, revoking its consent clears the ciphertext however that happens,
-- its terms never change, and the link opens it only while it and its consent
-- are neither revoked nor expired.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(31);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000005a1', 'sharer@example.com'),
  ('00000000-0000-4000-8000-0000000005a2', 'someone-else@example.com');

-- One consent per share, named for the share it backs. c2 is an ordinary grant
-- to an organization, and c3 belongs to someone else.
INSERT INTO public.consents (id, user_id, granted_to, granted_to_name, access_level, purpose, data_category, end_date, revoked) VALUES
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d1', 'Dr. Patel', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005c2', '00000000-0000-4000-8000-0000000005a1',
   'org-1', 'Some clinic', 'read', 'Appointments', 'health', now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005c3', '00000000-0000-4000-8000-0000000005a2',
   'link:00000000-0000-4000-8000-0000000005d3', 'Coach', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005c4', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d4', 'Physio', 'export', 'Health summary shared by link', 'health',
   now() - interval '1 day', false),
  ('00000000-0000-4000-8000-0000000005c5', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d5', 'Long', 'export', 'Health summary shared by link', 'health',
   now() + interval '40 days', false),
  ('00000000-0000-4000-8000-0000000005c6', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d6', 'Wide', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005c7', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d7', 'Empty', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005c8', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d8', 'Revoked share', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005c9', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005d9', 'Mismatch', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false),
  ('00000000-0000-4000-8000-0000000005ca', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005da', 'Revoked first', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', true),
  ('00000000-0000-4000-8000-0000000005cb', '00000000-0000-4000-8000-0000000005a1',
   'link:00000000-0000-4000-8000-0000000005db', 'Race', 'export', 'Health summary shared by link', 'health',
   now() + interval '7 days', false);

-- 1. Who may touch the table ------------------------------------------------------

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.health_shares'::regclass),
  'Row level security is on'
);

SELECT ok(
  NOT has_any_column_privilege('authenticated', 'public.health_shares', 'INSERT')
    AND NOT has_any_column_privilege('authenticated', 'public.health_shares', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.health_shares', 'DELETE')
    AND NOT has_any_column_privilege('anon', 'public.health_shares', 'INSERT')
    AND NOT has_any_column_privilege('anon', 'public.health_shares', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.health_shares', 'DELETE'),
  'Only the server writes shares'
);

SELECT ok(
  NOT has_any_column_privilege('anon', 'public.health_shares', 'SELECT')
    AND NOT has_column_privilege('authenticated', 'public.health_shares', 'ciphertext', 'SELECT'),
  'Nobody reads the ciphertext through the API'
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
  'The server stores a share against the consent made for it'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d3', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c3', 'c2VhbGVk', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '7 days') $$,
  '23503',
  NULL,
  'A share cannot stand on someone else''s consent'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d2', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c2', 'c2VhbGVk', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '7 days') $$,
  '23514',
  'A shared health summary needs the consent made for it, in force and ending when the share does.',
  'A share cannot stand on a grant to an organization'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d9', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c9', 'c2VhbGVk', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '6 days') $$,
  '23514',
  'A shared health summary needs the consent made for it, in force and ending when the share does.',
  'A share ends when its consent does'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005da', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005ca', 'c2VhbGVk', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '7 days') $$,
  '23514',
  'A shared health summary needs the consent made for it, in force and ending when the share does.',
  'A consent revoked before its share is stored never gets one'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d5', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c5', 'c2VhbGVk', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '40 days') $$,
  '23514',
  NULL,
  'A share expires within a month'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d6', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c6', 'c2VhbGVk', ARRAY['steps'], '2025-01-01', '2026-09-30',
             now() + interval '7 days') $$,
  '23514',
  NULL,
  'A share covers a year at most'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
     VALUES ('00000000-0000-4000-8000-0000000005d7', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c7', '', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '7 days') $$,
  '23514',
  NULL,
  'A share holds something'
);

SELECT throws_ok(
  $$ INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at, revoked_at)
     VALUES ('00000000-0000-4000-8000-0000000005d8', '00000000-0000-4000-8000-0000000005a1',
             '00000000-0000-4000-8000-0000000005c8', 'c2VhbGVk', ARRAY['steps'], '2026-09-01', '2026-09-30',
             now() + interval '7 days', now()) $$,
  '23514',
  NULL,
  'A revoked share holds no ciphertext'
);

-- An expired share, made before the test's clock.
INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, created_at, expires_at)
VALUES ('00000000-0000-4000-8000-0000000005d4', '00000000-0000-4000-8000-0000000005a1',
        '00000000-0000-4000-8000-0000000005c4', 'c2VhbGVk', ARRAY['weight_kg'],
        '2026-08-01', '2026-08-31', now() - interval '8 days', now() - interval '1 day');

-- A share whose consent was revoked without its trigger running, as if the two
-- had raced: the link must still refuse it.
INSERT INTO public.health_shares (id, user_id, consent_id, ciphertext, metrics, range_start, range_end, expires_at)
VALUES ('00000000-0000-4000-8000-0000000005db', '00000000-0000-4000-8000-0000000005a1',
        '00000000-0000-4000-8000-0000000005cb', 'c2VhbGVk', ARRAY['steps'],
        '2026-09-01', '2026-09-30', now() + interval '7 days');

RESET ROLE;
ALTER TABLE public.consents DISABLE TRIGGER clear_revoked_health_share;
UPDATE public.consents SET revoked = true, revoked_at = now() WHERE id = '00000000-0000-4000-8000-0000000005cb';
ALTER TABLE public.consents ENABLE TRIGGER clear_revoked_health_share;
SET LOCAL ROLE service_role;

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
  $$ SELECT state, ciphertext FROM public.open_health_share('00000000-0000-4000-8000-0000000005db') $$,
  $$ VALUES ('revoked'::text, NULL::text) $$,
  'A share whose consent is revoked does not open, even if its ciphertext remains'
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
  3,
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

-- 6. Deleting -----------------------------------------------------------------------

DELETE FROM public.consents WHERE id = '00000000-0000-4000-8000-0000000005c4';

SELECT is(
  (SELECT count(*)::int FROM public.health_shares WHERE id = '00000000-0000-4000-8000-0000000005d4'),
  0,
  'Deleting a consent deletes its share'
);

DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000005a1';

SELECT is(
  (SELECT count(*)::int FROM public.health_shares WHERE user_id = '00000000-0000-4000-8000-0000000005a1'),
  0,
  'Deleting the account deletes every share'
);

SELECT * FROM finish();
ROLLBACK;
