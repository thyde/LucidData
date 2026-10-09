-- The vault's key material is written only by the services that guard it.
-- Each block acts as a signed-in person through PostgREST's role, the way a
-- browser holding its own session and the public key would, or as the server.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000001a1', 'keeper@example.com'),
  ('00000000-0000-4000-8000-0000000001a2', 'newcomer@example.com');

UPDATE public.users
SET key_salt = 'c2FsdC1rZWVwZXI=',
    wrapped_master_key = 'ZXNjcm93',
    recovery_code_salt = 'ZXNjcm93LXNhbHQ='
WHERE id = '00000000-0000-4000-8000-0000000001a1';

INSERT INTO public.recovery_factors (id, user_id, type, label, wrapped_master_key, salt) VALUES
  ('00000000-0000-4000-8000-0000000001e1', '00000000-0000-4000-8000-0000000001a1', 'recovery_kit', 'Backup kit', 'a2l0', 'a2l0LXNhbHQ=');

-- 1. A signed-in person cannot write key material directly ------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000001a1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE public.users SET key_salt = 'bmV3LXNhbHQ=' WHERE id = '00000000-0000-4000-8000-0000000001a1' $$,
  '42501',
  NULL,
  'A person cannot change their key salt directly'
);

SELECT throws_ok(
  $$ UPDATE public.users SET wrapped_master_key = 'am9yZWQ=', recovery_code_salt = 'eA==' WHERE id = '00000000-0000-4000-8000-0000000001a1' $$,
  '42501',
  NULL,
  'A person cannot replace their recovery escrow directly'
);

SELECT throws_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt)
     VALUES ('00000000-0000-4000-8000-0000000001a1', 'recovery_kit', 'Planted', 'eA==', 'eQ==') $$,
  '42501',
  NULL,
  'A person cannot add a recovery factor without the service'
);

SELECT throws_ok(
  $$ UPDATE public.recovery_factors SET last_confirmed_at = NOW() WHERE id = '00000000-0000-4000-8000-0000000001e1' $$,
  '42501',
  NULL,
  'A person cannot change a recovery factor directly'
);

SELECT throws_ok(
  $$ DELETE FROM public.recovery_factors WHERE id = '00000000-0000-4000-8000-0000000001e1' $$,
  '42501',
  NULL,
  'A person cannot remove a recovery factor without the service'
);

SELECT is(
  (SELECT count(*)::int FROM public.recovery_factors),
  1,
  'A person still reads their own recovery factors'
);

SELECT lives_ok(
  $$ UPDATE public.users SET display_name = 'Keeper', recovery_last_confirmed_at = NOW()
     WHERE id = '00000000-0000-4000-8000-0000000001a1' $$,
  'A person can still edit their profile and confirm their recovery'
);

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000001a2", "role": "authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.recovery_factors),
  0,
  'Nobody else can read them'
);

RESET ROLE;

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.users', 'key_salt', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.users', 'wrapped_master_key', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.users', 'recovery_code_salt', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.users', 'recovery_codes_generated_at', 'UPDATE')
    AND NOT has_column_privilege('anon', 'public.users', 'key_salt', 'UPDATE'),
  'Neither API role holds an update grant on the key columns'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.recovery_factors', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.recovery_factors', 'DELETE'),
  'Signed-out callers cannot write recovery factors either'
);

-- 2. The server writes them -------------------------------------------------

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt)
     VALUES ('00000000-0000-4000-8000-0000000001a2', 'recovery_code', 'Recovery code', 'Y29kZQ==', 'Y29kZS1zYWx0') $$,
  'The server adds recovery factors'
);

SELECT lives_ok(
  $$ UPDATE public.users SET wrapped_master_key = NULL, recovery_code_salt = NULL, recovery_codes_generated_at = NULL
     WHERE id = '00000000-0000-4000-8000-0000000001a1' $$,
  'The server clears an escrow that a new master key retired'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
