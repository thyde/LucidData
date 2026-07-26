-- LD-106 session listing and revocation.
--
-- PostgREST does not expose the auth schema, so session management goes through
-- two SECURITY DEFINER functions. Both are scoped to the calling user: they read
-- auth.uid() themselves and never take a user id as a parameter, so a caller
-- cannot list or end anyone else's sessions.

CREATE OR REPLACE FUNCTION public.list_my_sessions()
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip)::text
  FROM auth.sessions s
  WHERE s.user_id = (SELECT auth.uid())
  ORDER BY s.updated_at DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.list_my_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_my_sessions() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_my_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_sessions() TO service_role;

-- End one of the caller's own sessions. Deleting the auth session invalidates
-- its refresh token, so the browser cannot mint another access token.
CREATE OR REPLACE FUNCTION public.revoke_my_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := (SELECT auth.uid());
  v_deleted INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RETURN FALSE;
  END IF;

  DELETE FROM auth.refresh_tokens rt
  WHERE rt.session_id = p_session_id
    AND EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id = p_session_id AND s.user_id = v_user
    );

  DELETE FROM auth.sessions s
  WHERE s.id = p_session_id AND s.user_id = v_user;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_my_session(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_my_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_my_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_my_session(UUID) TO service_role;
