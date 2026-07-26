-- Preserve accepted offer terms after an offer closes and provide a
-- privacy-preserving code the buyer can redeem without learning user identity.
ALTER TABLE public.offer_claims
  ADD COLUMN buyer_org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN offer_title TEXT,
  ADD COLUMN incentive TEXT,
  ADD COLUMN target_category TEXT,
  ADD COLUMN redemption_code TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'claimed',
  ADD COLUMN withdrawn_at TIMESTAMPTZ,
  ADD COLUMN redeemed_at TIMESTAMPTZ;

UPDATE public.offer_claims AS claim
SET buyer_org_id = offer.buyer_org_id,
    offer_title = offer.title,
    incentive = offer.incentive,
    target_category = offer.target_category,
    redemption_code = 'LC-' || UPPER(SUBSTR(REPLACE(claim.id::TEXT, '-', ''), 1, 12))
FROM public.offers AS offer
WHERE offer.id = claim.offer_id;

ALTER TABLE public.offer_claims
  ALTER COLUMN buyer_org_id SET NOT NULL,
  ALTER COLUMN offer_title SET NOT NULL,
  ALTER COLUMN incentive SET NOT NULL,
  ALTER COLUMN target_category SET NOT NULL,
  ALTER COLUMN redemption_code SET NOT NULL,
  ADD CONSTRAINT offer_claims_status_check
    CHECK (status IN ('claimed', 'withdrawn', 'redeemed')),
  ADD CONSTRAINT offer_claims_state_timestamps_check
    CHECK (
      (status = 'claimed' AND withdrawn_at IS NULL AND redeemed_at IS NULL) OR
      (status = 'withdrawn' AND withdrawn_at IS NOT NULL AND redeemed_at IS NULL) OR
      (status = 'redeemed' AND withdrawn_at IS NULL AND redeemed_at IS NOT NULL)
    ),
  ADD CONSTRAINT offer_claims_redemption_code_key UNIQUE (redemption_code);

CREATE INDEX idx_offer_claims_buyer_status
  ON public.offer_claims(buyer_org_id, status, created_at DESC);

-- Claims must be created through claim_offer_atomic so the server snapshots
-- verified, active offer terms. Direct PostgREST inserts are no longer allowed.
DROP POLICY "offer_claims_insert_own" ON public.offer_claims;

CREATE OR REPLACE FUNCTION public.claim_offer_atomic(
  p_offer_id UUID
)
RETURNS SETOF public.offer_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  offer_row public.offers%ROWTYPE;
  organization_row public.organizations%ROWTYPE;
  claim_row public.offer_claims%ROWTYPE;
  new_code TEXT := 'LC-' || UPPER(SUBSTR(REPLACE(public.uuid_generate_v4()::TEXT, '-', ''), 1, 12));
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT offer.* INTO offer_row
  FROM public.offers AS offer
  WHERE offer.id = p_offer_id
    AND offer.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found or no longer active';
  END IF;

  SELECT organization.* INTO organization_row
  FROM public.organizations AS organization
  WHERE organization.id = offer_row.buyer_org_id
    AND organization.verified_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The buyer organization is not verified';
  END IF;

  SELECT * INTO claim_row
  FROM public.offer_claims
  WHERE offer_id = p_offer_id
    AND user_id = current_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF claim_row.status = 'redeemed' THEN
      RAISE EXCEPTION 'This offer was already redeemed';
    END IF;
    IF claim_row.status = 'claimed' THEN
      RETURN NEXT claim_row;
      RETURN;
    END IF;

    UPDATE public.offer_claims
    SET buyer_org_id = offer_row.buyer_org_id,
        offer_title = offer_row.title,
        incentive = offer_row.incentive,
        target_category = offer_row.target_category,
        redemption_code = new_code,
        status = 'claimed',
        created_at = NOW(),
        withdrawn_at = NULL,
        redeemed_at = NULL
    WHERE id = claim_row.id
    RETURNING * INTO claim_row;
  ELSE
    INSERT INTO public.offer_claims (
      offer_id,
      user_id,
      buyer_org_id,
      offer_title,
      incentive,
      target_category,
      redemption_code
    ) VALUES (
      offer_row.id,
      current_user_id,
      offer_row.buyer_org_id,
      offer_row.title,
      offer_row.incentive,
      offer_row.target_category,
      new_code
    )
    RETURNING * INTO claim_row;
  END IF;

  RETURN NEXT claim_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_offer_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_offer_atomic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_offer_atomic(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_offer_claim_atomic(
  p_claim_id UUID
)
RETURNS SETOF public.offer_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  claim_row public.offer_claims%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO claim_row
  FROM public.offer_claims
  WHERE id = p_claim_id
    AND user_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer claim not found';
  END IF;
  IF claim_row.status <> 'claimed' THEN
    RAISE EXCEPTION 'Only an unredeemed offer can be removed';
  END IF;

  UPDATE public.offer_claims
  SET status = 'withdrawn',
      withdrawn_at = NOW()
  WHERE id = claim_row.id
  RETURNING * INTO claim_row;

  RETURN NEXT claim_row;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_offer_claim_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_offer_claim_atomic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_offer_claim_atomic(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_offer_claim_atomic(
  p_organization_id UUID,
  p_redemption_code TEXT
)
RETURNS SETOF public.offer_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  claim_row public.offer_claims%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members AS member
    JOIN public.organizations AS organization
      ON organization.id = member.organization_id
    WHERE member.organization_id = p_organization_id
      AND member.user_id = current_user_id
      AND organization.data_buyer = TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden: data buyer membership required';
  END IF;

  SELECT * INTO claim_row
  FROM public.offer_claims
  WHERE buyer_org_id = p_organization_id
    AND redemption_code = UPPER(TRIM(p_redemption_code))
  FOR UPDATE;

  IF NOT FOUND OR claim_row.status <> 'claimed' THEN
    RAISE EXCEPTION 'Valid unredeemed offer code not found';
  END IF;

  UPDATE public.offer_claims
  SET status = 'redeemed',
      redeemed_at = NOW()
  WHERE id = claim_row.id
  RETURNING * INTO claim_row;

  RETURN NEXT claim_row;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_offer_claim_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_offer_claim_atomic(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_offer_claim_atomic(UUID, TEXT) TO authenticated;