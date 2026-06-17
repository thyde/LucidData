-- Security hardening surfaced by the Supabase database linter after the initial
-- cloud deployment.
--
-- 1. public.organizations was created without RLS, leaving it readable/writable
--    through the public PostgREST API with the anon/publishable key. Application
--    code only ever touches organizations via the service role (API-key auth and
--    guarded server actions), so we enable RLS and add a single member-scoped
--    SELECT policy: signed-in members may read their own organizations, anon and
--    non-members get nothing, and the service role bypasses RLS for registration,
--    verification, and API-key flows.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_member" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
    )
  );

-- 2. handle_auth_user_change is a SECURITY DEFINER trigger function. Pin its
--    search_path so it cannot be hijacked through a mutable search_path, and
--    revoke EXECUTE from the API roles so it cannot be invoked as a PostgREST RPC.
--    It is only ever called by the on_auth_user_created trigger, which still fires
--    normally (trigger execution does not require EXECUTE on the function).
CREATE OR REPLACE FUNCTION public.handle_auth_user_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_auth_user_change() FROM PUBLIC, anon, authenticated;
