-- Close direct writes that let a signed-in person skip the server's checks.
--
-- PostgREST exposes every public table, so whatever row level security allows,
-- a person can do with their own session and the public API key, without our
-- server in the path. Four such writes were open and should not have been:
--
--   1. users.email. Credential issuance, credential and consent requests, and
--      passkey sign-in find a person by this column, so rewriting it claimed
--      someone else's address. It now changes only when the auth address does.
--   2. pool_contributions. The payout, the payload, the schema type, and the
--      category are trustworthy only when the contribution service writes them.
--      The service writes with the service role; API roles cannot write at all.
--   3. credential_shares. A share row for someone else's credential exposed
--      claims its subject never chose to disclose. Shares are written by the
--      server, only for the credential's own subject, and answer only a request
--      sent to that person.
--   4. vault_data. Health data could be stored without the consent LD-110
--      requires, by writing the row directly instead of through the vault
--      service.
--
-- Requests a person answers keep their terms: only the response columns can
-- change. Rights cases are filed only by the server, as their table already
-- intended.
--
-- Three one-time corrections run before the new rules: addresses changed
-- directly are restored from the sign-in address; contributions of restricted
-- data are withdrawn with a notice to each person, and payouts on any
-- contribution are held to what the buyer paid for it; and shares that never
-- answered anything are revoked or unlinked.
--
-- Every new trigger ignores the updates a foreign key makes when a referenced
-- row is deleted, so deleting a vault entry or a request is never refused.

-- 1. users: a person edits their own profile and key material, never their
-- address. The auth trigger keeps email in step, as the table owner.
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (
  display_name,
  key_hint,
  key_salt,
  wrapped_master_key,
  recovery_code_salt,
  recovery_codes_generated_at,
  recovery_setup_declined_at,
  recovery_last_confirmed_at,
  onboarding_completed,
  email_notifications_enabled,
  updated_at
) ON public.users TO authenticated;

-- Restore any address that was changed directly before this.
UPDATE public.users AS u
SET email = a.email,
    updated_at = NOW()
FROM auth.users AS a
WHERE a.id = u.id
  AND a.email IS NOT NULL
  AND u.email IS DISTINCT FROM a.email;

-- 2. pool_contributions: server-written only.
DROP POLICY IF EXISTS "pool_contributions_insert_own" ON public.pool_contributions;
DROP POLICY IF EXISTS "pool_contributions_update_own" ON public.pool_contributions;
REVOKE INSERT, UPDATE, DELETE ON public.pool_contributions FROM anon, authenticated;

-- Health, financial, location, and browsing data are never for sale. A tracker
-- summary is browsing data although it is filed under "other". This function
-- holds the database's only copy of both lists; lib/validations/marketplace.ts
-- holds the other, and a test compares them.
CREATE OR REPLACE FUNCTION public.is_sale_restricted(p_category TEXT, p_schema_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  restricted_categories CONSTANT TEXT[] := ARRAY['health', 'financial', 'location', 'browsing'];
  restricted_schema_types CONSTANT TEXT[] := ARRAY[
    'browsing_insight', 'financial_summary', 'fitness_activity', 'fitness_daily', 'medical_basic'
  ];
BEGIN
  RETURN COALESCE(p_category = ANY (restricted_categories), FALSE)
    OR COALESCE(p_schema_type = ANY (restricted_schema_types), FALSE);
END;
$$;

-- Revoke-then-grant: REVOKE FROM PUBLIC also strips service_role, which runs
-- the contribution service and therefore the trigger below.
REVOKE EXECUTE ON FUNCTION public.is_sale_restricted(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sale_restricted(TEXT, TEXT) TO service_role;

-- Before 2026-10-08 the contribution service checked only the pool's
-- category, so a contribution could come from an entry holding restricted data,
-- and it recorded the pool's category rather than the entry's. Withdraw every
-- active contribution that is restricted by its own columns or by its source
-- entry, and tell each person once. No later sale can include them; a buyer
-- who already bought a dataset keeps that copy, and the notice says so.
WITH withdrawn AS (
  UPDATE public.pool_contributions AS c
  SET status = 'withdrawn',
      updated_at = NOW()
  WHERE c.status = 'active'
    AND (
      public.is_sale_restricted(c.category, c.schema_type)
      OR EXISTS (
        SELECT 1
        FROM public.vault_data AS v
        WHERE v.id = c.vault_data_id
          AND public.is_sale_restricted(v.category, v.schema_type)
      )
    )
  RETURNING c.user_id
)
INSERT INTO public.notifications (user_id, type, title, message, related_entity_type)
SELECT
  w.user_id,
  'marketplace_contribution_withdrawn',
  CASE
    WHEN COUNT(*) = 1 THEN 'We withdrew a marketplace contribution'
    ELSE format('We withdrew %s marketplace contributions', COUNT(*))
  END,
  CASE
    WHEN COUNT(*) = 1 THEN
      'It came from an entry holding health, financial, location, or browsing data, which is never for sale. No future dataset will include it. A buyer who already bought a dataset with it keeps that copy.'
    ELSE
      'They came from entries holding health, financial, location, or browsing data, which is never for sale. No future dataset will include them. A buyer who already bought a dataset with them keeps that copy.'
  END,
  'pool_contribution'
FROM withdrawn AS w
GROUP BY w.user_id;

-- A contribution written directly could also carry any payout. The service has
-- always recorded the pool's price per record, and no pool's price changes
-- after it is created, so any other value was not written by the service.
-- Reset it, and the same value wherever an order copied it. Then cap every
-- payout not yet sent at what the buyer paid for the record, recomputing the
-- fee from the cap at the payout's own rate. A capped payout that leaves
-- nothing owed is closed rather than left to fail on every retry. A transfer
-- that already went out is left as it is.
UPDATE public.pool_contributions AS c
SET payout_cents = p.price_per_record_cents,
    updated_at = NOW()
FROM public.data_pools AS p
WHERE p.id = c.pool_id
  AND c.payout_cents <> p.price_per_record_cents;

UPDATE public.data_order_records AS r
SET payout_cents = p.price_per_record_cents
FROM public.data_orders AS o
JOIN public.data_pools AS p ON p.id = o.pool_id
WHERE o.id = r.order_id
  AND r.payout_cents > p.price_per_record_cents;

UPDATE public.payouts AS y
SET gross_cents = p.price_per_record_cents,
    platform_fee_cents = ROUND(p.price_per_record_cents * y.fee_bps / 10000.0)::INTEGER,
    amount_cents = p.price_per_record_cents
      - ROUND(p.price_per_record_cents * y.fee_bps / 10000.0)::INTEGER,
    status = CASE
      WHEN p.price_per_record_cents - ROUND(p.price_per_record_cents * y.fee_bps / 10000.0) <= 0
        THEN 'failed'
      ELSE y.status
    END,
    last_error = CASE
      WHEN p.price_per_record_cents - ROUND(p.price_per_record_cents * y.fee_bps / 10000.0) <= 0
        THEN 'Nothing is owed: the payout was above the price the buyer paid for the record'
      ELSE y.last_error
    END,
    next_attempt_at = CASE
      WHEN p.price_per_record_cents - ROUND(p.price_per_record_cents * y.fee_bps / 10000.0) <= 0
        THEN NULL
      ELSE y.next_attempt_at
    END,
    updated_at = NOW()
FROM public.data_pools AS p
WHERE p.id = y.pool_id
  AND y.status IN ('pending', 'held', 'failed')
  AND (y.gross_cents > p.price_per_record_cents OR y.amount_cents > p.price_per_record_cents);

-- The same rule for every role from here on, judged by the contribution and by
-- the entry it came from. An update is checked only when it could make a row
-- restricted: becoming active, a new category or schema type, or a different
-- source entry. Deleting a vault entry clears vault_data_id through its
-- foreign key, which changes none of those, so it is never refused here.
CREATE OR REPLACE FUNCTION public.refuse_restricted_contribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  entry_category TEXT;
  entry_schema_type TEXT;
BEGIN
  -- Withdrawing is always allowed.
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'active'
    AND NEW.category IS NOT DISTINCT FROM OLD.category
    AND NEW.schema_type IS NOT DISTINCT FROM OLD.schema_type
    AND (NEW.vault_data_id IS NULL OR NEW.vault_data_id IS NOT DISTINCT FROM OLD.vault_data_id)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.vault_data_id IS NOT NULL THEN
    SELECT v.category, v.schema_type
    INTO entry_category, entry_schema_type
    FROM public.vault_data AS v
    WHERE v.id = NEW.vault_data_id;
  END IF;

  IF public.is_sale_restricted(NEW.category, NEW.schema_type)
    OR public.is_sale_restricted(entry_category, entry_schema_type)
  THEN
    RAISE EXCEPTION 'Health, financial, location, and browsing data are never for sale'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refuse_restricted_contribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pool_contributions_refuse_restricted ON public.pool_contributions;
CREATE TRIGGER pool_contributions_refuse_restricted
  BEFORE INSERT OR UPDATE ON public.pool_contributions
  FOR EACH ROW EXECUTE FUNCTION public.refuse_restricted_contribution();

-- 3. credential_shares: a person reads their own shares; the server writes them.
DROP POLICY IF EXISTS "cs_all_own" ON public.credential_shares;
DROP POLICY IF EXISTS "cs_select_own" ON public.credential_shares;
CREATE POLICY "cs_select_own" ON public.credential_shares
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.credential_shares FROM anon, authenticated;

-- Shares written directly by someone other than the credential's subject, or
-- linked to a request sent to someone else, never answered anything, and the
-- server ignores both. Revoke the first and unlink the second, so neither can
-- surface later.
UPDATE public.credential_shares AS s
SET revoked = TRUE,
    revoked_at = COALESCE(s.revoked_at, NOW())
WHERE NOT s.revoked
  AND NOT EXISTS (
    SELECT 1
    FROM public.issued_credentials AS c
    WHERE c.id = s.credential_id
      AND c.subject_user_id = s.user_id
  );

UPDATE public.credential_shares AS s
SET credential_request_id = NULL
WHERE s.credential_request_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.credential_requests AS r
    WHERE r.id = s.credential_request_id
      AND r.user_id = s.user_id
  );

-- Only the person a credential was issued to can share it, and a share can
-- answer only a request sent to that person, whoever writes. An update is
-- checked only when it changes the credential or the person, or links a
-- different request. Deleting a request clears the link through its foreign
-- key, which is never refused here.
CREATE OR REPLACE FUNCTION public.require_share_by_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.credential_id IS NOT DISTINCT FROM OLD.credential_id
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND (
      NEW.credential_request_id IS NULL
      OR NEW.credential_request_id IS NOT DISTINCT FROM OLD.credential_request_id
    )
  THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.issued_credentials AS c
    WHERE c.id = NEW.credential_id
      AND c.subject_user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Only the subject of a credential can share it'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.credential_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.credential_requests AS r
    WHERE r.id = NEW.credential_request_id
      AND r.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A share can answer only a request sent to the person sharing'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_share_by_subject() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS credential_shares_subject_only ON public.credential_shares;
CREATE TRIGGER credential_shares_subject_only
  BEFORE INSERT OR UPDATE OF credential_id, user_id, credential_request_id
  ON public.credential_shares
  FOR EACH ROW EXECUTE FUNCTION public.require_share_by_subject();

-- 4. Requests keep their terms. A person answers; they do not rewrite what was
-- asked, or who asked it.
REVOKE UPDATE ON public.consent_requests FROM anon, authenticated;
GRANT UPDATE (status, response_note, responded_at, consent_id)
  ON public.consent_requests TO authenticated;

REVOKE UPDATE ON public.credential_requests FROM anon, authenticated;
GRANT UPDATE (status, response_note, responded_at)
  ON public.credential_requests TO authenticated;

-- Rights cases are filed by the server, which sets the deadline from the
-- jurisdiction and checks that an appeal contests the person's own refusal.
-- The insert policy let a person file one directly with any status or
-- deadline, or point an appeal at someone else's case, which the one-appeal
-- index would then hold against that person's own appeal.
DROP POLICY IF EXISTS "Users file their own rights cases" ON public.rights_cases;
REVOKE INSERT, UPDATE, DELETE ON public.rights_cases FROM anon, authenticated;

-- 5. vault_data: health data needs consent, however it is written.
--
-- Applies to signed-in API sessions. Server code using the service role
-- checks consent itself, and maintenance connections are not a person.
-- Matches isHealthEntry in lib/constants/legal.ts: the health category, or a
-- schema type the registry files under health. Consent is whatever the most
-- recent health-data record says, as in lib/services/legal.service.ts.
CREATE OR REPLACE FUNCTION public.require_health_data_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  health_schema_types CONSTANT TEXT[] := ARRAY['fitness_activity', 'fitness_daily', 'medical_basic'];
  latest_action TEXT;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.category = 'health' OR NEW.schema_type = ANY (health_schema_types)) THEN
    RETURN NEW;
  END IF;

  -- Relabelling or re-wrapping health data already stored stores nothing new.
  IF TG_OP = 'UPDATE'
    AND (OLD.category = 'health' OR OLD.schema_type = ANY (health_schema_types))
    AND NEW.client_ciphertext IS NOT DISTINCT FROM OLD.client_ciphertext
  THEN
    RETURN NEW;
  END IF;

  SELECT a.action
  INTO latest_action
  FROM public.legal_acceptances AS a
  WHERE a.user_id = NEW.user_id
    AND a.document = 'health-data'
  ORDER BY a.recorded_at DESC
  LIMIT 1;

  IF latest_action IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Consent to store health data is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_health_data_consent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vault_data_health_consent ON public.vault_data;
CREATE TRIGGER vault_data_health_consent
  BEFORE INSERT OR UPDATE ON public.vault_data
  FOR EACH ROW EXECUTE FUNCTION public.require_health_data_consent();
