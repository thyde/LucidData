-- Keep organization API keys as versioned, revocable hashes. Plaintext keys are
-- returned once by the application and never persisted.
CREATE TABLE public.organization_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Primary key'
    CHECK (char_length(name) BETWEEN 1 AND 80),
  key_hash TEXT NOT NULL UNIQUE,
  key_suffix TEXT
    CHECK (key_suffix IS NULL OR key_suffix ~ '^[A-Za-z0-9_-]{6}$'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'rotated', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CHECK (
    (status = 'active' AND revoked_at IS NULL) OR
    (status <> 'active' AND revoked_at IS NOT NULL)
  )
);

ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_api_keys_select_member"
  ON public.organization_api_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_members AS member
      WHERE member.organization_id = organization_api_keys.organization_id
        AND member.user_id = (SELECT auth.uid())
    )
  );

-- API-key hashes never need to be exposed through PostgREST. Application reads
-- use an owner-checked server action and select only safe metadata.
REVOKE ALL ON TABLE public.organization_api_keys FROM anon, authenticated;

CREATE UNIQUE INDEX idx_organization_api_keys_one_active
  ON public.organization_api_keys(organization_id)
  WHERE status = 'active';
CREATE INDEX idx_organization_api_keys_org_created
  ON public.organization_api_keys(organization_id, created_at DESC);

INSERT INTO public.organization_api_keys (organization_id, key_hash)
SELECT id, api_key_hash
FROM public.organizations;

CREATE OR REPLACE FUNCTION public.mirror_initial_organization_api_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.organization_api_keys (organization_id, key_hash)
  VALUES (NEW.id, NEW.api_key_hash);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_initial_organization_api_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mirror_initial_organization_api_key() FROM anon, authenticated;

CREATE TRIGGER mirror_initial_organization_api_key
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_initial_organization_api_key();

CREATE OR REPLACE FUNCTION public.rotate_organization_api_key(
  p_organization_id UUID,
  p_key_hash TEXT,
  p_key_suffix TEXT,
  p_name TEXT DEFAULT 'Primary key'
)
RETURNS SETOF public.organization_api_keys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  new_key public.organization_api_keys%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE organization_id = p_organization_id
      AND user_id = current_user_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Forbidden: organization owner required';
  END IF;

  IF p_key_hash IS NULL OR p_key_hash = '' OR
     p_key_suffix !~ '^[A-Za-z0-9_-]{6}$' OR
     char_length(p_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid API key metadata';
  END IF;

  UPDATE public.organization_api_keys
  SET status = 'rotated', revoked_at = NOW()
  WHERE organization_id = p_organization_id
    AND status = 'active';

  INSERT INTO public.organization_api_keys (
    organization_id,
    name,
    key_hash,
    key_suffix
  ) VALUES (
    p_organization_id,
    p_name,
    p_key_hash,
    p_key_suffix
  )
  RETURNING * INTO new_key;

  -- Preserve compatibility for code that still reads the legacy column. API
  -- authentication uses organization_api_keys after this migration.
  UPDATE public.organizations
  SET api_key_hash = p_key_hash,
      updated_at = NOW()
  WHERE id = p_organization_id;

  RETURN NEXT new_key;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_organization_api_key(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_organization_api_key(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rotate_organization_api_key(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_organization_api_key(
  p_key_id UUID
)
RETURNS SETOF public.organization_api_keys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  revoked_key public.organization_api_keys%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT key_row.* INTO revoked_key
  FROM public.organization_api_keys AS key_row
  JOIN public.org_members AS member
    ON member.organization_id = key_row.organization_id
  WHERE key_row.id = p_key_id
    AND member.user_id = current_user_id
    AND member.role = 'owner'
  FOR UPDATE OF key_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found or organization owner required';
  END IF;

  IF revoked_key.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active API key can be revoked';
  END IF;

  UPDATE public.organization_api_keys
  SET status = 'revoked', revoked_at = NOW()
  WHERE id = p_key_id
  RETURNING * INTO revoked_key;

  RETURN NEXT revoked_key;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_organization_api_key(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_organization_api_key(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_organization_api_key(UUID) TO authenticated;