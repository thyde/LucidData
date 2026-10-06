-- Security invariants for the public schema. CI runs this with `supabase test db`
-- after building the database from every migration, so a migration that breaks
-- one of these rules fails the pull request instead of reaching production.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

SELECT is_empty(
  $$
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  $$,
  'Every public table has row level security enabled'
);

SELECT is_empty(
  $$
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT ('search_path=""' = ANY (coalesce(p.proconfig, '{}')))
  $$,
  'Every SECURITY DEFINER function pins an empty search_path'
);

SELECT is_empty(
  $$
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'No SECURITY DEFINER function is executable by anon'
);

-- Adding a function to this list is a deliberate decision to expose it as an
-- RPC to every signed-in user. Each one must scope itself to auth.uid().
SELECT is_empty(
  $$
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'claim_offer_atomic',
        'list_my_sessions',
        'redeem_offer_claim_atomic',
        'revoke_my_session',
        'revoke_organization_api_key',
        'rotate_organization_api_key',
        'withdraw_offer_claim_atomic'
      )
  $$,
  'Only the reviewed SECURITY DEFINER functions are callable by signed-in users'
);

-- A policy only takes effect if the role also holds the table privilege. A
-- database built from these migrations once had every policy and none of the
-- privileges, so signed-in users could read nothing. organization_api_keys is
-- closed on purpose: its hashes are read only by the service role.
SELECT is_empty(
  $$
    SELECT c.relname || '.' || p.polname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (0 = ANY (p.polroles) OR 'authenticated'::regrole::oid = ANY (p.polroles))
      AND c.relname NOT IN ('organization_api_keys')
      AND NOT has_table_privilege(
        'authenticated',
        c.oid,
        CASE p.polcmd
          WHEN 'a' THEN 'INSERT'
          WHEN 'w' THEN 'UPDATE'
          WHEN 'd' THEN 'DELETE'
          ELSE 'SELECT'
        END
      )
  $$,
  'Every policy for signed-in users has the table privilege it needs'
);

SELECT * FROM finish();

ROLLBACK;
