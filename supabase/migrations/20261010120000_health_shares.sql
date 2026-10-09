-- LD-305: health summaries shared by link.
--
-- A person shares chosen health figures over a date range with someone who has
-- no account, such as a clinician or a coach. The browser encrypts the summary
-- with a key it makes for that one share and puts the key in the link, after
-- the # sign, which browsers do not send to any server. This table holds the
-- ciphertext and the terms: which figures, which dates, and until when.
--
-- Each share is backed by a row in consents, so it is listed with every other
-- grant, gets a signed receipt, and is revoked the same way. Revoking that
-- consent clears the ciphertext here, whichever path revokes it, and a share's
-- terms cannot change after it is made.
--
-- Only the server writes shares. A person reads their own, without the
-- ciphertext, which nobody but the server needs and which is useless without
-- the key in the link.

-- Lets a share name its consent and its owner together, so the two always
-- belong to the same person. id is already unique, so this costs one index.
ALTER TABLE public.consents
  ADD CONSTRAINT consents_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.health_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  consent_id uuid NOT NULL UNIQUE,
  -- base64 of a 12-byte IV followed by the AES-GCM ciphertext and tag. Cleared
  -- when the share is revoked or expires.
  ciphertext text,
  metrics text[] NOT NULL,
  range_start date NOT NULL,
  range_end date NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_shares_consent_fkey FOREIGN KEY (consent_id, user_id)
    REFERENCES public.consents(id, user_id) ON DELETE CASCADE,
  CONSTRAINT health_shares_metrics CHECK (cardinality(metrics) BETWEEN 1 AND 24),
  CONSTRAINT health_shares_range CHECK (range_end >= range_start AND range_end - range_start < 366),
  -- The server allows 30 days at most. A day of slack covers clock skew
  -- between the server and the database.
  CONSTRAINT health_shares_expiry CHECK (expires_at > created_at AND expires_at <= created_at + interval '31 days'),
  CONSTRAINT health_shares_ciphertext CHECK (ciphertext IS NULL OR length(ciphertext) BETWEEN 1 AND 1048576),
  CONSTRAINT health_shares_revoked_holds_nothing CHECK (revoked_at IS NULL OR ciphertext IS NULL),
  CONSTRAINT health_shares_view_count CHECK (view_count >= 0)
);

ALTER TABLE public.health_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_shares FROM anon, authenticated;
GRANT SELECT (
  id, user_id, consent_id, metrics, range_start, range_end, expires_at,
  revoked_at, view_count, last_viewed_at, created_at
) ON public.health_shares TO authenticated;

CREATE POLICY "health_shares_select_own" ON public.health_shares
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_health_shares_user_created ON public.health_shares(user_id, created_at DESC);
CREATE INDEX idx_health_shares_expiring ON public.health_shares(expires_at) WHERE ciphertext IS NOT NULL;

COMMENT ON TABLE public.health_shares IS
  'Health summaries shared by link. The browser encrypts each one with a key carried only in the link fragment; the server holds ciphertext and terms.';

-- A share stands on the consent made for it: one that names this share as its
-- recipient, is in force, and ends when the share does. Reading the consent
-- FOR SHARE makes a revocation racing this insert wait for it, so that
-- revocation's trigger then finds the share and clears it.
CREATE FUNCTION public.check_health_share_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  grant_row public.consents%ROWTYPE;
BEGIN
  SELECT * INTO grant_row FROM public.consents WHERE id = NEW.consent_id FOR SHARE;
  -- A consent that does not exist is the foreign key's to refuse.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF grant_row.revoked
    OR grant_row.granted_to IS DISTINCT FROM 'link:' || NEW.id::text
    OR grant_row.end_date IS DISTINCT FROM NEW.expires_at
  THEN
    RAISE EXCEPTION 'A shared health summary needs the consent made for it, in force and ending when the share does.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_health_share_consent() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER check_health_share_consent
  BEFORE INSERT ON public.health_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.check_health_share_consent();

-- A consent behind a share changes only by being revoked. Its terms are what
-- the receipt states and what the link enforces, so neither may drift. The
-- expiry job may still mark it expired.
CREATE FUNCTION public.guard_health_share_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.health_shares WHERE consent_id = OLD.id) THEN
    RETURN NEW;
  END IF;
  IF (OLD.revoked AND NOT NEW.revoked)
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.vault_data_id IS DISTINCT FROM OLD.vault_data_id
    OR NEW.granted_to IS DISTINCT FROM OLD.granted_to
    OR NEW.granted_to_name IS DISTINCT FROM OLD.granted_to_name
    OR NEW.granted_to_email IS DISTINCT FROM OLD.granted_to_email
    OR NEW.access_level IS DISTINCT FROM OLD.access_level
    OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.consent_type IS DISTINCT FROM OLD.consent_type
    OR NEW.data_category IS DISTINCT FROM OLD.data_category
    OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
  THEN
    RAISE EXCEPTION 'A shared health summary keeps its terms. Revoke it and share a new one.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_health_share_consent() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_health_share_consent
  BEFORE UPDATE ON public.consents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_health_share_consent();

-- Revoking the consent deletes what the link opens, however it was revoked:
-- from the share list, from the consents page, or directly.
CREATE FUNCTION public.clear_revoked_health_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.health_shares
  SET ciphertext = NULL,
      revoked_at = COALESCE(NEW.revoked_at, now())
  WHERE consent_id = NEW.id
    AND revoked_at IS NULL;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_revoked_health_share() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER clear_revoked_health_share
  AFTER UPDATE OF revoked ON public.consents
  FOR EACH ROW
  WHEN (NEW.revoked AND NOT OLD.revoked)
  EXECUTE FUNCTION public.clear_revoked_health_share();

-- Opening a share from its link. Returns the ciphertext only while the share
-- and its consent are neither revoked nor expired, and counts the view in the
-- same statement. previous_view_at lets the caller record a view in the
-- owner's audit trail without recording every reload.
CREATE FUNCTION public.open_health_share(p_id uuid)
RETURNS TABLE (
  state text,
  ciphertext text,
  expires_at timestamptz,
  created_at timestamptz,
  user_id uuid,
  consent_id uuid,
  previous_view_at timestamptz
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  share public.health_shares%ROWTYPE;
  consent_revoked boolean;
BEGIN
  SELECT * INTO share FROM public.health_shares s WHERE s.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing'::text, NULL::text, NULL::timestamptz, NULL::timestamptz,
      NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  -- The share's own state is cleared with its consent; the consent is read too,
  -- so the two can never disagree in the share's favour.
  SELECT c.revoked INTO consent_revoked FROM public.consents c WHERE c.id = share.consent_id;
  IF share.revoked_at IS NOT NULL OR consent_revoked IS NOT FALSE THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::text, share.expires_at, share.created_at,
      share.user_id, share.consent_id, share.last_viewed_at;
    RETURN;
  END IF;
  IF share.expires_at <= now() OR share.ciphertext IS NULL THEN
    RETURN QUERY SELECT 'expired'::text, NULL::text, share.expires_at, share.created_at,
      share.user_id, share.consent_id, share.last_viewed_at;
    RETURN;
  END IF;
  UPDATE public.health_shares s
  SET view_count = s.view_count + 1,
      last_viewed_at = now()
  WHERE s.id = p_id;
  RETURN QUERY SELECT 'open'::text, share.ciphertext, share.expires_at, share.created_at,
    share.user_id, share.consent_id, share.last_viewed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_health_share(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_health_share(uuid) TO service_role;
