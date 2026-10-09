-- One audit chain per person.
--
-- Each audit entry hashes the one before it, so a changed or reordered entry
-- shows. Until now nothing stopped two appends from linking to the same entry:
-- the server read the latest hash and inserted, so two requests at once, or a
-- scheduled job that could not see the latest entry, started a second branch.
-- The end of a branch is an entry nothing points at, and such an entry could
-- be deleted without a trace.
--
-- From here on every insert must link to the person's current head, which is
-- kept in its own row and moved under a row lock, so the chain cannot branch.
-- The server appends through append_audit_log, which reads the head and
-- hashes the entry under that lock, so concurrent appends wait their turn
-- rather than failing. The ends of branches already in the log are listed in
-- one sealing entry per person, in the hashed action text, so deleting one of
-- them shows too.

CREATE TABLE public.audit_chain_heads (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  -- The hash the next entry must link to. Null until the first entry.
  head_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_chain_heads IS
  'The hash each person''s next audit entry must link to. Moved only by the audit_logs insert trigger.';

ALTER TABLE public.audit_chain_heads ENABLE ROW LEVEL SECURITY;

-- A person can read their own head, so verification under their session can
-- check that the newest entry is still there. Only the trigger writes.
CREATE POLICY audit_chain_heads_select_own ON public.audit_chain_heads
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.audit_chain_heads FROM anon, authenticated;
GRANT SELECT ON TABLE public.audit_chain_heads TO authenticated;

-- The audit hash, as createAuditHash in lib/crypto/hashing.ts computes it:
-- SHA-256 of the JSON text of the link, event type, person, time to the
-- millisecond in UTC, and action, in that order. to_json escapes strings the
-- way JSON.stringify does, which the pgTAP test checks against vectors
-- computed in JavaScript.
CREATE FUNCTION public.audit_entry_hash(
  p_previous_hash text,
  p_event_type text,
  p_user_id uuid,
  p_timestamp timestamptz,
  p_action text
) RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT encode(
    sha256(convert_to(
      '{"previousHash":' || to_json(coalesce(nullif(p_previous_hash, ''), '0'))::text
        || ',"eventType":' || to_json(p_event_type)::text
        || ',"userId":' || to_json(p_user_id::text)::text
        || ',"timestamp":' || to_json(to_char(p_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
        || ',"action":' || to_json(p_action)::text
        || '}',
      'UTF8'
    )),
    'hex'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.audit_entry_hash(text, text, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
-- append_audit_log runs as the server's role and hashes with it.
GRANT EXECUTE ON FUNCTION public.audit_entry_hash(text, text, uuid, timestamptz, text) TO service_role;

-- Refuse an entry that does not link to the head, then move the head to it.
-- The row lock makes concurrent appends take turns: the second one finds the
-- head moved and is refused with PT409, which PostgREST returns as 409, and
-- the server reads the head again and retries.
CREATE FUNCTION public.audit_logs_keep_one_chain() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_head text;
BEGIN
  INSERT INTO public.audit_chain_heads (user_id, head_hash)
  VALUES (NEW.user_id, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT head_hash INTO v_head
  FROM public.audit_chain_heads
  WHERE user_id = NEW.user_id
  FOR UPDATE;

  IF NEW.previous_hash IS DISTINCT FROM v_head THEN
    RAISE EXCEPTION 'The audit chain has moved on. Read its head again and retry.'
      USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.audit_chain_heads
  SET head_hash = NEW.current_hash, updated_at = now()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.audit_logs_keep_one_chain() FROM PUBLIC, anon, authenticated;

-- Append an entry to a person's chain. The head is read under its row lock
-- and the entry is hashed here, with the time cut to the millisecond as
-- JavaScript keeps it, so a second append waits for the first and then links
-- to it. The insert trigger takes the same lock, already held, and passes.
CREATE FUNCTION public.append_audit_log(
  p_user_id uuid,
  p_event_type text,
  p_action text,
  p_vault_data_id uuid DEFAULT NULL,
  p_consent_id uuid DEFAULT NULL,
  p_actor_id text DEFAULT NULL,
  p_actor_type text DEFAULT 'user',
  p_actor_name text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS public.audit_logs
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_head text;
  v_at timestamptz;
  v_row public.audit_logs;
BEGIN
  INSERT INTO public.audit_chain_heads (user_id, head_hash)
  VALUES (p_user_id, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT head_hash INTO v_head
  FROM public.audit_chain_heads
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_at := date_trunc('milliseconds', clock_timestamp());

  INSERT INTO public.audit_logs (
    user_id, vault_data_id, consent_id, event_type, action,
    actor_id, actor_type, actor_name, ip_address, user_agent, method,
    success, error_message, previous_hash, current_hash, metadata, "timestamp"
  ) VALUES (
    p_user_id, p_vault_data_id, p_consent_id, p_event_type, p_action,
    coalesce(p_actor_id, p_user_id::text), coalesce(p_actor_type, 'user'), p_actor_name,
    p_ip_address, p_user_agent, p_method,
    coalesce(p_success, true), p_error_message, v_head,
    public.audit_entry_hash(v_head, p_event_type, p_user_id, v_at, p_action),
    p_metadata, v_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END
$$;

REVOKE EXECUTE ON FUNCTION public.append_audit_log(uuid, text, text, uuid, uuid, text, text, text, text, text, text, boolean, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_audit_log(uuid, text, text, uuid, uuid, text, text, text, text, text, text, boolean, text, jsonb)
  TO service_role;

-- Make the newest end of a person's log the head, and when the log has other
-- ends, link one sealing entry to the head that lists them in its action,
-- which the hash covers. Ends an earlier seal listed stay sealed, so running
-- it again adds nothing. It holds the head's row lock throughout, so an
-- append in flight either finishes first and is counted, or waits for the
-- seal. Returns how many ends it sealed.
CREATE FUNCTION public.seal_audit_chain_ends(p_user_id uuid) RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ends text[];
  v_at timestamptz;
  v_action text;
  v_hash text;
BEGIN
  INSERT INTO public.audit_chain_heads (user_id, head_hash)
  VALUES (p_user_id, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1 FROM public.audit_chain_heads WHERE user_id = p_user_id FOR UPDATE;

  SELECT array_agg(a.current_hash ORDER BY a."timestamp" DESC, a.id DESC)
  INTO v_ends
  FROM public.audit_logs a
  WHERE a.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.audit_logs b
      WHERE b.user_id = p_user_id AND b.previous_hash = a.current_hash
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.audit_logs s
      WHERE s.user_id = p_user_id
        AND s.event_type = 'audit_chain_sealed'
        AND s.metadata -> 'sealed_ends' ? a.current_hash
    );

  IF v_ends IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.audit_chain_heads
  SET head_hash = v_ends[1], updated_at = now()
  WHERE user_id = p_user_id;

  IF cardinality(v_ends) = 1 THEN
    RETURN 0;
  END IF;

  -- Later than every entry already there, so the seal is also the newest by
  -- time, which is what the code before append_audit_log links to.
  SELECT greatest(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', max(a."timestamp") + interval '1 millisecond')
  )
  INTO v_at
  FROM public.audit_logs a
  WHERE a.user_id = p_user_id;
  v_action := format(
    'Sealed %s earlier branch %s of this log: %s',
    cardinality(v_ends) - 1,
    CASE WHEN cardinality(v_ends) = 2 THEN 'end' ELSE 'ends' END,
    array_to_string(v_ends[2:], ', ')
  );
  v_hash := public.audit_entry_hash(v_ends[1], 'audit_chain_sealed', p_user_id, v_at, v_action);

  INSERT INTO public.audit_logs (
    user_id, event_type, action, actor_id, actor_type, actor_name,
    previous_hash, current_hash, "timestamp", metadata
  ) VALUES (
    p_user_id, 'audit_chain_sealed', v_action, p_user_id::text, 'system', 'LucidData',
    v_ends[1], v_hash, v_at, jsonb_build_object('sealed_ends', to_jsonb(v_ends[2:]))
  );

  UPDATE public.audit_chain_heads
  SET head_hash = v_hash, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN cardinality(v_ends) - 1;
END
$$;

REVOKE EXECUTE ON FUNCTION public.seal_audit_chain_ends(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Seal every existing log and turn the check on in one step, holding off
-- inserts meanwhile, so no entry can land between a head being set and the
-- trigger that keeps it.
DO $$
DECLARE
  r record;
  v_elsewhere integer;
BEGIN
  LOCK TABLE public.audit_logs IN SHARE ROW EXCLUSIVE MODE;

  FOR r IN SELECT DISTINCT user_id FROM public.audit_logs LOOP
    PERFORM public.seal_audit_chain_ends(r.user_id);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.audit_chain_heads h
      WHERE h.user_id = a.user_id AND h.head_hash IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'An audit log was left without a head';
  END IF;

  -- The code running now links to the newest entry by time and stamps the
  -- new one with the server's clock. Where clock skew put an earlier time on
  -- the true end, or an entry is dated after now, its appends are refused
  -- after at most one until the code that appends through append_audit_log
  -- ships. Expected to be none; counted so the run says if not.
  SELECT count(*) INTO v_elsewhere
  FROM public.audit_chain_heads h
  WHERE h.head_hash IS DISTINCT FROM (
    SELECT a.current_hash FROM public.audit_logs a
    WHERE a.user_id = h.user_id
    ORDER BY a."timestamp" DESC
    LIMIT 1
  )
  OR EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.user_id = h.user_id AND a."timestamp" > clock_timestamp()
  );
  IF v_elsewhere > 0 THEN
    RAISE WARNING '% audit logs end on an entry that is not their newest by time, or hold one dated in the future', v_elsewhere;
  END IF;

  CREATE TRIGGER audit_logs_keep_one_chain
    BEFORE INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.audit_logs_keep_one_chain();
END
$$;
