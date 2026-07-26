-- Restore the API-role table privileges PostgREST needs.
--
-- Found by resetting a local database from these migrations and watching the
-- app fail with "permission denied for table vault_data" for the authenticated
-- role. The cause is that tables here are created by `postgres`, and the
-- default privileges for `postgres` in this schema grant only TRUNCATE,
-- REFERENCES, TRIGGER, and MAINTAIN to anon and authenticated. The Supabase
-- default that grants SELECT, INSERT, UPDATE, and DELETE belongs to
-- `supabase_admin`, so it never applied to anything we created.
--
-- Existing deployments work because they were provisioned before this, which is
-- exactly why it went unnoticed: the schema is not reproducible from the
-- migrations alone. This makes it reproducible.
--
-- Security note. Table privileges are not the guardrail here; row level
-- security is. Every table has RLS enabled, and a table with no policy denies
-- every row to anon and authenticated no matter what is granted below. The
-- explicit revokes at the end cover the tables that must never be reachable
-- through the API even if a policy is added later by mistake.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Future tables created by postgres inherit the same grants, so the next
-- migration does not reintroduce the problem.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- Re-apply the closures the blanket grant above would otherwise have undone.

-- API keys are read and written only by the service role.
REVOKE ALL ON TABLE public.organization_api_keys FROM anon, authenticated;

-- Signing keys, both organization and platform. A leaked wrapped private key
-- plus a leaked ISSUER_KEY_SECRET is a forged credential.
REVOKE ALL ON TABLE public.issuer_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_keys FROM anon, authenticated;

-- Step-up grants are short-lived proof of re-authentication. A person who could
-- write one could authorise their own account deletion without a password.
REVOKE ALL ON TABLE public.step_up_grants FROM anon, authenticated;

-- Throttles and scheduler bookkeeping. Writable counters are not a rate limit.
REVOKE ALL ON TABLE public.rate_limit_counters FROM anon, authenticated;
REVOKE ALL ON TABLE public.job_runs FROM anon, authenticated;

-- Evidence of erasure. It has no foreign key to users by design, so nothing
-- else constrains who could read it.
REVOKE ALL ON TABLE public.deletion_receipts FROM anon, authenticated;

-- Rights case evidence stays append-only. A cascade delete from a removed
-- account still works, because that runs as the table owner.
REVOKE DELETE, UPDATE ON TABLE public.rights_case_events FROM anon, authenticated;
