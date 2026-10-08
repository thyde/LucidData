-- LD-209: four more health shapes, refused for sale and gated on consent like
-- the others.
--
-- The vault gains sleep_session, vitals_daily, body_measurement, and
-- nutrition_daily, all filed under health. The database keeps its own copies
-- of two lists the app also holds: schema types that can never be sold, and
-- schema types that need the person's consent before they are stored. Both
-- copies learn the new types here. This ships before the code that offers
-- them, so for a while the database refuses types the app does not offer yet,
-- which is the safe direction.

CREATE OR REPLACE FUNCTION public.is_sale_restricted(p_category TEXT, p_schema_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  restricted_categories CONSTANT TEXT[] := ARRAY['health', 'financial', 'location', 'browsing'];
  restricted_schema_types CONSTANT TEXT[] := ARRAY[
    'body_measurement', 'browsing_insight', 'financial_summary', 'fitness_activity', 'fitness_daily',
    'medical_basic', 'nutrition_daily', 'sleep_session', 'vitals_daily'
  ];
BEGIN
  RETURN COALESCE(p_category = ANY (restricted_categories), FALSE)
    OR COALESCE(p_schema_type = ANY (restricted_schema_types), FALSE);
END;
$$;

-- Revoke-then-grant: REVOKE FROM PUBLIC also strips service_role, which runs
-- the contribution service and therefore the trigger that calls this.
REVOKE EXECUTE ON FUNCTION public.is_sale_restricted(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sale_restricted(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.require_health_data_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  health_schema_types CONSTANT TEXT[] := ARRAY[
    'body_measurement', 'fitness_activity', 'fitness_daily', 'medical_basic', 'nutrition_daily',
    'sleep_session', 'vitals_daily'
  ];
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

-- Housekeeping, unrelated to the health types: rewrap_vault_entries_atomic is
-- no longer called. Since the code moved to rewrap_vault_keys, which also
-- moves the connector key and refuses an entry edited meanwhile, the old
-- function only gave a signed-in session a way to rewrite its own key
-- envelopes without the step-up check.
DROP FUNCTION IF EXISTS public.rewrap_vault_entries_atomic(JSONB);
