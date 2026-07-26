-- Preserve the category an organization requested and approve the request plus
-- its resulting consent in one authenticated transaction.
ALTER TABLE public.consents
  ADD COLUMN data_category TEXT;

ALTER TABLE public.consents
  ADD CONSTRAINT consents_data_category_check
    CHECK (
      data_category IS NULL OR data_category IN (
        'personal', 'health', 'financial', 'credentials',
        'location', 'interests', 'browsing', 'other'
      )
    );

ALTER TABLE public.consent_requests
  ADD COLUMN consent_id UUID REFERENCES public.consents(id) ON DELETE SET NULL;

CREATE INDEX idx_consents_org_category
  ON public.consents(granted_to, data_category, revoked, end_date);
CREATE INDEX idx_cr_consent ON public.consent_requests(consent_id);

CREATE OR REPLACE FUNCTION public.approve_consent_request_atomic(
  request_id UUID,
  response_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  request_row public.consent_requests%ROWTYPE;
  organization_row public.organizations%ROWTYPE;
  consent_row public.consents%ROWTYPE;
  updated_request public.consent_requests%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO request_row
  FROM public.consent_requests
  WHERE id = request_id
    AND user_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consent request not found';
  END IF;
  IF request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been answered';
  END IF;

  SELECT * INTO organization_row
  FROM public.organizations
  WHERE id = request_row.organization_id;

  INSERT INTO public.consents (
    user_id,
    granted_to,
    granted_to_name,
    granted_to_email,
    access_level,
    purpose,
    end_date,
    consent_type,
    data_category
  ) VALUES (
    current_user_id,
    request_row.organization_id::TEXT,
    organization_row.name,
    organization_row.email,
    request_row.access_level,
    request_row.purpose,
    request_row.expires_at,
    'explicit',
    request_row.data_category
  )
  RETURNING * INTO consent_row;

  UPDATE public.consent_requests
  SET status = 'approved',
      response_note = approve_consent_request_atomic.response_note,
      responded_at = NOW(),
      consent_id = consent_row.id
  WHERE id = request_row.id
  RETURNING * INTO updated_request;

  RETURN jsonb_build_object(
    'request', to_jsonb(updated_request),
    'consent_id', consent_row.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_consent_request_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_consent_request_atomic(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_consent_request_atomic(UUID, TEXT) TO authenticated;