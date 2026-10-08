-- LD-610: users.key_salt can be set once and never changed, whoever asks.
-- Since 20261008150000 only the server sets it; a signed-in session cannot
-- write it at all.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'salt-owner@example.com');

-- Act as the account owner, through PostgREST's role, the way a browser holding
-- its own session would.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE public.users SET key_salt = 'owner-salt' WHERE id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501',
  NULL,
  'The owner cannot set the salt directly, even while it is empty'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ UPDATE public.users SET key_salt = 'first-salt' WHERE id = '00000000-0000-4000-8000-0000000000a1' AND key_salt IS NULL $$,
  'The server sets the salt while it is empty'
);

SELECT throws_ok(
  $$ UPDATE public.users SET key_salt = 'second-salt' WHERE id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  'key_salt cannot change once it is set',
  'The server cannot replace a salt that is set'
);

SELECT throws_ok(
  $$ UPDATE public.users SET key_salt = NULL WHERE id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  'key_salt cannot change once it is set',
  'The server cannot clear a salt that is set'
);

SELECT lives_ok(
  $$ UPDATE public.users SET key_salt = 'first-salt', display_name = 'Owner' WHERE id = '00000000-0000-4000-8000-0000000000a1' $$,
  'Writing the same salt back, alongside other columns, is allowed'
);

RESET ROLE;

SELECT throws_ok(
  $$ UPDATE public.users SET key_salt = 'superuser-salt' WHERE id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  'key_salt cannot change once it is set',
  'Privileged roles cannot replace it either'
);

SELECT is(
  (SELECT key_salt FROM public.users WHERE id = '00000000-0000-4000-8000-0000000000a1'),
  'first-salt',
  'The first salt is the one kept'
);

SELECT * FROM finish();

ROLLBACK;
