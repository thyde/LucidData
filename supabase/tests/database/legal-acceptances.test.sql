-- LD-110: acceptance records are the person's own, append-only, and the
-- organization terms can only be accepted by an owner.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'legal-owner@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'legal-member@example.com');

INSERT INTO public.organizations (id, name, email, api_key_hash) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'Synthetic Clinic', 'org@example.com', 'hash');

INSERT INTO public.org_members (organization_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'owner'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'member');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

SELECT lives_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'terms', '2026-10-08', 'registration') $$,
  'A person records their own acceptance'
);

SELECT throws_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b2', 'terms', '2026-10-08', 'registration') $$,
  '42501',
  NULL,
  'Nobody records an acceptance for someone else'
);

SELECT lives_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, organization_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1',
             'organization-terms', '2026-10-08', 'organization-registration') $$,
  'An owner accepts the organization terms for their organization'
);

SELECT throws_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'organization-terms', '2026-10-08', 'prompt') $$,
  '23514',
  NULL,
  'Organization terms always name the organization'
);

SELECT throws_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, organization_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1',
             'terms', '2026-10-08', 'prompt') $$,
  '23514',
  NULL,
  'Personal documents never name an organization'
);

SELECT lives_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, document, version, action, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'health-data', '2026-10-08', 'withdrawn', 'settings') $$,
  'Consent to store health data can be withdrawn'
);

SELECT throws_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, document, version, action, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'terms', '2026-10-08', 'withdrawn', 'settings') $$,
  '23514',
  NULL,
  'Accepted terms are not withdrawn, only replaced by a new version'
);

SELECT throws_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'privacy', 'latest', 'prompt') $$,
  '23514',
  NULL,
  'A version is a date, so it can be compared with the published one'
);

SELECT throws_ok(
  $$ UPDATE public.legal_acceptances SET version = '2099-01-01'
     WHERE user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501',
  NULL,
  'A person cannot edit their acceptance record'
);

SELECT throws_ok(
  $$ DELETE FROM public.legal_acceptances WHERE user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501',
  NULL,
  'A person cannot delete their acceptance record'
);

-- A member who is not an owner cannot accept organization terms.
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO public.legal_acceptances (user_id, organization_id, document, version, source)
     VALUES ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1',
             'organization-terms', '2026-10-08', 'organization-registration') $$,
  '42501',
  NULL,
  'Only an owner accepts the organization terms'
);

SELECT is(
  (SELECT count(*)::int FROM public.legal_acceptances),
  0,
  'A person sees only their own records'
);

RESET ROLE;

SELECT throws_ok(
  $$ UPDATE public.legal_acceptances SET version = '2099-01-01'
     WHERE user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  'P0001',
  'legal_acceptances is append-only',
  'Not even a privileged role can edit an acceptance record'
);

SELECT lives_ok(
  $$ INSERT INTO public.rights_cases (user_id, type, jurisdiction, due_at)
     VALUES ('00000000-0000-4000-8000-0000000000b1', 'access', 'us_wa', NOW() + INTERVAL '45 days') $$,
  'Rights requests can name Washington'
);

SELECT * FROM finish();

ROLLBACK;
