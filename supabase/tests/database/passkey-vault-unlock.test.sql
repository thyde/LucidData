-- LD-112: a passkey factor wraps a copy of the master key under a passkey's
-- PRF output. It names its passkey, only the server writes it, and it goes
-- when the passkey goes.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000004a1', 'passkey@example.com'),
  ('00000000-0000-4000-8000-0000000004a2', 'someone-else@example.com');

INSERT INTO public.passkeys (id, user_id, credential_id, public_key) VALUES
  ('00000000-0000-4000-8000-0000000004b1', '00000000-0000-4000-8000-0000000004a1', 'cred-one', 'pk1'),
  ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000004a1', 'cred-two', 'pk2');

SELECT lives_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt, passkey_id)
     VALUES ('00000000-0000-4000-8000-0000000004a1', 'passkey_prf', 'Laptop', 'wrapped', 'prf-salt', '00000000-0000-4000-8000-0000000004b1') $$,
  'A passkey factor is stored against its passkey'
);

SELECT throws_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt)
     VALUES ('00000000-0000-4000-8000-0000000004a1', 'passkey_prf', 'Loose', 'wrapped', 'prf-salt') $$,
  '23514',
  NULL,
  'A passkey factor must name its passkey'
);

SELECT throws_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt, passkey_id)
     VALUES ('00000000-0000-4000-8000-0000000004a1', 'recovery_kit', 'Kit', 'wrapped', 'salt', '00000000-0000-4000-8000-0000000004b2') $$,
  '23514',
  NULL,
  'Only a passkey factor names a passkey'
);

SELECT throws_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt, passkey_id)
     VALUES ('00000000-0000-4000-8000-0000000004a1', 'passkey_prf', 'Again', 'wrapped', 'prf-salt', '00000000-0000-4000-8000-0000000004b1') $$,
  '23505',
  NULL,
  'A passkey has one way into the vault'
);

SELECT throws_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt, passkey_id)
     VALUES ('00000000-0000-4000-8000-0000000004a1', 'passkey_prf', 'Ghost', 'wrapped', 'prf-salt', '00000000-0000-4000-8000-0000000004b9') $$,
  '23503',
  NULL,
  'A passkey factor cannot name a passkey that does not exist'
);

-- 2. Only the server writes factors -----------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000004a1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.recovery_factors (user_id, type, label, wrapped_master_key, salt, passkey_id)
     VALUES ('00000000-0000-4000-8000-0000000004a1', 'passkey_prf', 'Direct', 'wrapped', 'prf-salt', '00000000-0000-4000-8000-0000000004b2') $$,
  '42501',
  NULL,
  'A person cannot add a passkey factor directly'
);

SELECT is(
  (SELECT count(*)::int FROM public.recovery_factors WHERE type = 'passkey_prf'),
  1,
  'A person can read their own passkey factor'
);

-- Removing the passkey, as a person may do directly, takes its factor with it.
DELETE FROM public.passkeys WHERE id = '00000000-0000-4000-8000-0000000004b1';

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.recovery_factors WHERE passkey_id = '00000000-0000-4000-8000-0000000004b1'),
  0,
  'Deleting a passkey deletes its factor'
);

SELECT is(
  (SELECT count(*)::int FROM public.passkeys WHERE id = '00000000-0000-4000-8000-0000000004b1'),
  0,
  'The passkey itself is gone'
);

SELECT * FROM finish();
ROLLBACK;
