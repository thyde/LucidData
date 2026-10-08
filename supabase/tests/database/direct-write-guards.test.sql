-- Writes that must go through the server, and the checks that hold for every
-- role. Each block acts as a signed-in person through PostgREST's role, the
-- same way a browser holding its own session and the public key would.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'holder@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'someone@example.com');

INSERT INTO public.organizations (id, name, email, api_key_hash) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'Synthetic University', 'registrar@example.com', 'hash');

INSERT INTO public.data_pools (id, buyer_org_id, name, category) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'Synthetic pool', 'credentials');

INSERT INTO public.issued_credentials (
  id, organization_id, subject_user_id, subject_email, schema_type, label, claims,
  signed_payload, signature, key_id
) VALUES (
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-0000000000b1', 'holder@example.com', 'education', 'Diploma',
  '{"degree": "BSc", "gpa": "3.9"}', '{}', 'signature', 'key'
);

INSERT INTO public.vault_data (id, user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt) VALUES
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1', 'Job', 'credentials', 'employment', 'c', 'k', 's'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b1', 'Allergies', 'personal', 'medical_basic', 'c', 'k', 's');

-- 1. users.email ------------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE public.users SET email = 'holder@example.com' WHERE id = '00000000-0000-4000-8000-0000000000b2' $$,
  '42501',
  NULL,
  'A person cannot change the address other features look them up by'
);

SELECT lives_ok(
  $$ UPDATE public.users SET display_name = 'Someone', onboarding_completed = TRUE WHERE id = '00000000-0000-4000-8000-0000000000b2' $$,
  'A person can still edit their own profile'
);

RESET ROLE;

UPDATE auth.users SET email = 'someone.new@example.com' WHERE id = '00000000-0000-4000-8000-0000000000b2';
SELECT is(
  (SELECT email FROM public.users WHERE id = '00000000-0000-4000-8000-0000000000b2'),
  'someone.new@example.com',
  'The address follows a change to the sign-in address'
);

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.users', 'email', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.users', 'universal_opt_out', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.users', 'ingest_public_key', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.users', 'signup_source', 'UPDATE'),
  'Columns the server sets are closed to signed-in sessions'
);

-- 2. pool_contributions -----------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.pool_contributions (pool_id, user_id, vault_data_id, anonymized_payload, category, payout_cents, schema_type)
     VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1',
             '00000000-0000-4000-8000-0000000000f1', '{"role": "Engineer"}', 'credentials', 999999, 'employment') $$,
  '42501',
  NULL,
  'A person cannot write a contribution, or its payout, directly'
);

RESET ROLE;

-- The service role stands in for the contribution service from here.
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ INSERT INTO public.pool_contributions (id, pool_id, user_id, vault_data_id, anonymized_payload, category, schema_type)
     VALUES ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000d1',
             '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000f1',
             '{"role": "Engineer"}', 'credentials', 'employment') $$,
  'The server can record a contribution of credential data'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE public.pool_contributions SET payout_cents = 999999 WHERE id = '00000000-0000-4000-8000-00000000a001' $$,
  '42501',
  NULL,
  'A person cannot raise the payout on a contribution afterwards'
);

SELECT is(
  (SELECT count(*)::int FROM public.pool_contributions WHERE user_id = '00000000-0000-4000-8000-0000000000b1'),
  1,
  'A person can still read their own contributions'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$ INSERT INTO public.pool_contributions (pool_id, user_id, vault_data_id, anonymized_payload, category, schema_type)
     VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1',
             '00000000-0000-4000-8000-0000000000f2', '{"allergies": "x"}', 'credentials', 'employment') $$,
  '23514',
  'Health, financial, location, and browsing data are never for sale',
  'A medical record is refused by its vault entry, whatever the contribution claims'
);

SELECT throws_ok(
  $$ INSERT INTO public.pool_contributions (pool_id, user_id, anonymized_payload, category, schema_type)
     VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1',
             '{"steps": 1}', 'credentials', 'fitness_daily') $$,
  '23514',
  'Health, financial, location, and browsing data are never for sale',
  'A restricted schema type is refused without a vault entry'
);

SELECT throws_ok(
  $$ INSERT INTO public.pool_contributions (pool_id, user_id, anonymized_payload, category, schema_type)
     VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1',
             '{"sites_visited": 1}', 'other', 'browsing_insight') $$,
  '23514',
  'Health, financial, location, and browsing data are never for sale',
  'A tracker summary is browsing data although it is filed under other'
);

SELECT throws_ok(
  $$ INSERT INTO public.pool_contributions (pool_id, user_id, anonymized_payload, category)
     VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1',
             '{"note": "x"}', 'health') $$,
  '23514',
  'Health, financial, location, and browsing data are never for sale',
  'A restricted category is refused'
);

SELECT lives_ok(
  $$ UPDATE public.pool_contributions SET status = 'withdrawn' WHERE id = '00000000-0000-4000-8000-00000000a001' $$,
  'Withdrawing a contribution is always allowed'
);

RESET ROLE;

-- A contribution made before the rule, from a medical record. The rule is
-- switched off only to recreate one.
ALTER TABLE public.pool_contributions DISABLE TRIGGER pool_contributions_refuse_restricted;
INSERT INTO public.pool_contributions (id, pool_id, user_id, vault_data_id, anonymized_payload, category, schema_type)
  VALUES ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000d1',
          '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000f2',
          '{"allergies": "x"}', 'credentials', 'medical_basic');
ALTER TABLE public.pool_contributions ENABLE TRIGGER pool_contributions_refuse_restricted;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

SELECT lives_ok(
  $$ DELETE FROM public.vault_data WHERE id = '00000000-0000-4000-8000-0000000000f2' $$,
  'A person can delete an entry that an older contribution came from'
);

RESET ROLE;

SELECT is(
  (SELECT vault_data_id FROM public.pool_contributions WHERE id = '00000000-0000-4000-8000-00000000a002'),
  NULL::uuid,
  'Deleting the entry clears the link on the contribution'
);

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ UPDATE public.pool_contributions SET status = 'withdrawn' WHERE id = '00000000-0000-4000-8000-00000000a002' $$,
  'An older restricted contribution can be withdrawn'
);

SELECT throws_ok(
  $$ UPDATE public.pool_contributions SET status = 'active' WHERE id = '00000000-0000-4000-8000-00000000a002' $$,
  '23514',
  'Health, financial, location, and browsing data are never for sale',
  'A restricted contribution cannot be made active again'
);

RESET ROLE;

-- 3. credential_shares ------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.credential_shares (credential_id, user_id, token_hash, disclosed_claims)
     VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2', 'hash', ARRAY['gpa']) $$,
  '42501',
  NULL,
  'A person cannot write a share row directly'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$ INSERT INTO public.credential_shares (credential_id, user_id, token_hash, disclosed_claims)
     VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2', 'hash-2', ARRAY['gpa']) $$,
  '23514',
  'Only the subject of a credential can share it',
  'Nobody but the subject can share a credential, even through the server'
);

SELECT lives_ok(
  $$ INSERT INTO public.credential_shares (credential_id, user_id, token_hash, disclosed_claims)
     VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'hash-3', ARRAY['degree']) $$,
  'The subject can share their own credential'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.credential_shares),
  1,
  'The subject can read their own shares'
);

RESET ROLE;

INSERT INTO public.credential_requests (id, organization_id, user_id, subject_email, purpose) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-0000000000b1', 'holder@example.com', 'Check a degree'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-0000000000b2', 'someone@example.com', 'Check a degree');

SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$ INSERT INTO public.credential_shares (credential_id, user_id, token_hash, disclosed_claims, credential_request_id)
     VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'hash-4', ARRAY['degree'],
             '00000000-0000-4000-8000-0000000000a2') $$,
  '23514',
  'A share can answer only a request sent to the person sharing',
  'A share cannot answer a request sent to someone else'
);

SELECT lives_ok(
  $$ INSERT INTO public.credential_shares (id, credential_id, user_id, token_hash, disclosed_claims, credential_request_id)
     VALUES ('00000000-0000-4000-8000-00000000b501', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000b1', 'hash-5', ARRAY['degree'],
             '00000000-0000-4000-8000-0000000000a1') $$,
  'A share can answer a request sent to the person sharing'
);

RESET ROLE;

SELECT lives_ok(
  $$ DELETE FROM public.credential_requests WHERE id = '00000000-0000-4000-8000-0000000000a1' $$,
  'Deleting a request is not blocked by the share that answered it'
);

SELECT is(
  (SELECT credential_request_id FROM public.credential_shares WHERE id = '00000000-0000-4000-8000-00000000b501'),
  NULL::uuid,
  'Deleting the request clears the link on the share'
);

-- An older share written directly by someone who is not the subject, linked
-- to a request sent to them. The rule is switched off only to recreate one.
ALTER TABLE public.credential_shares DISABLE TRIGGER credential_shares_subject_only;
INSERT INTO public.credential_shares (credential_id, user_id, token_hash, disclosed_claims, credential_request_id)
  VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2', 'hash-6', ARRAY['gpa'],
          '00000000-0000-4000-8000-0000000000a2');
ALTER TABLE public.credential_shares ENABLE TRIGGER credential_shares_subject_only;

SELECT lives_ok(
  $$ DELETE FROM public.credential_requests WHERE id = '00000000-0000-4000-8000-0000000000a2' $$,
  'Deleting a request is not blocked by an older share that should not exist'
);

-- 4. Requests keep their terms ------------------------------------------------

SELECT ok(
  has_column_privilege('authenticated', 'public.consent_requests', 'status', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.consent_requests', 'purpose', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.consent_requests', 'organization_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.consent_requests', 'access_level', 'UPDATE'),
  'A consent request can be answered but not rewritten'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.credential_requests', 'status', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.credential_requests', 'purpose', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.credential_requests', 'organization_id', 'UPDATE'),
  'A credential request can be answered but not rewritten'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.rights_cases (user_id, type, jurisdiction, status, due_at)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'access', 'eu', 'fulfilled', NOW() + INTERVAL '10 years') $$,
  '42501',
  NULL,
  'A person cannot file a rights case with their own status or deadline'
);

RESET ROLE;

-- 5. Health data needs consent ----------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000000b2', 'Steps', 'personal', 'fitness_daily', 'c', 'k', 's') $$,
  '42501',
  'Consent to store health data is required',
  'Health data written directly still needs consent'
);

SELECT lives_ok(
  $$ INSERT INTO public.vault_data (user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000000b2', 'Job', 'credentials', 'employment', 'c', 'k', 's') $$,
  'Other data needs no health consent'
);

INSERT INTO public.legal_acceptances (user_id, document, version, source)
  VALUES ('00000000-0000-4000-8000-0000000000b2', 'health-data', '2026-10-08', 'settings');

SELECT lives_ok(
  $$ INSERT INTO public.vault_data (id, user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt)
     VALUES ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000b2', 'Steps', 'health', 'fitness_daily', 'c', 'k', 's') $$,
  'Health data is stored once consent is given'
);

INSERT INTO public.legal_acceptances (user_id, document, version, action, source, recorded_at)
  VALUES ('00000000-0000-4000-8000-0000000000b2', 'health-data', '2026-10-08', 'withdrawn', 'settings', NOW() + INTERVAL '1 second');

SELECT throws_ok(
  $$ UPDATE public.vault_data SET client_ciphertext = 'new' WHERE id = '00000000-0000-4000-8000-0000000000f3' $$,
  '42501',
  'Consent to store health data is required',
  'After withdrawal, new health data is refused'
);

SELECT lives_ok(
  $$ UPDATE public.vault_data SET label = 'Old steps', encrypted_dek = 'k2' WHERE id = '00000000-0000-4000-8000-0000000000f3' $$,
  'Relabelling or re-wrapping stored health data still works after withdrawal'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
