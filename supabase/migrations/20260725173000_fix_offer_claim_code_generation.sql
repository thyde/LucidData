-- claim_offer_atomic pins search_path to '', so it must not reference
-- uuid_generate_v4, which lives in the extensions schema. gen_random_uuid is a
-- pg_catalog builtin and always resolves.
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
  new_code TEXT := 'LC-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 12));
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
