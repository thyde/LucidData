-- LD-209: the four new health shapes are never for sale and need consent
-- before they are stored, even when an entry is filed under another category.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000002a1', 'sleeper@example.com');

-- 1. Never for sale, whatever the category -----------------------------------

SELECT ok(public.is_sale_restricted('personal', 'sleep_session'), 'A sleep session is never for sale');
SELECT ok(public.is_sale_restricted('personal', 'vitals_daily'), 'Daily vitals are never for sale');
SELECT ok(public.is_sale_restricted('personal', 'body_measurement'), 'A body measurement is never for sale');
SELECT ok(public.is_sale_restricted('personal', 'nutrition_daily'), 'Daily nutrition is never for sale');
SELECT ok(NOT public.is_sale_restricted('credentials', 'employment'), 'Unrestricted data stays sellable');

-- 2. Consent before they are stored ------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000002a1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000002a1', 'Night', 'personal', 'sleep_session', 'c', 'k', 's') $$,
  '42501',
  'Consent to store health data is required',
  'A sleep session filed elsewhere still needs health consent'
);

SELECT throws_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000002a1', 'Weigh-in', 'other', 'body_measurement', 'c', 'k', 's') $$,
  '42501',
  'Consent to store health data is required',
  'A body measurement filed elsewhere still needs health consent'
);

SELECT throws_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000002a1', 'Lunch', 'personal', 'nutrition_daily', 'c', 'k', 's') $$,
  '42501',
  'Consent to store health data is required',
  'Daily nutrition filed elsewhere still needs health consent'
);

RESET ROLE;
INSERT INTO public.legal_acceptances (user_id, document, version, source)
  VALUES ('00000000-0000-4000-8000-0000000002a1', 'health-data', '2026-10-08', 'settings');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000002a1", "role": "authenticated"}', true);

SELECT lives_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000002a1', 'Vitals', 'health', 'vitals_daily', 'c', 'k', 's') $$,
  'Daily vitals are stored once consent is given'
);

SELECT lives_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000002a1', 'Night', 'health', 'sleep_session', 'c', 'k', 's') $$,
  'A sleep session is stored once consent is given'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
