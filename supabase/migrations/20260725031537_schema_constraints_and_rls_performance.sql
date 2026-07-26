-- Make defaulted application fields match the invariants used by the codebase.
-- Existing production rows were checked before this migration and contain no
-- NULL values in these columns. Audit rows are never rewritten.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE timestamp IS NULL) THEN
    RAISE EXCEPTION 'audit_logs.timestamp contains NULL values; refusing to rewrite immutable audit history';
  END IF;
END
$$;

UPDATE public.users
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.vault_data
SET tags = COALESCE(tags, '{}'::TEXT[]),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE tags IS NULL OR created_at IS NULL OR updated_at IS NULL;

UPDATE public.consents
SET start_date = COALESCE(start_date, NOW()),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE start_date IS NULL OR created_at IS NULL OR updated_at IS NULL;

UPDATE public.organizations
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.consent_requests
SET requested_at = COALESCE(requested_at, NOW())
WHERE requested_at IS NULL;

UPDATE public.passkeys SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
UPDATE public.org_members SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
UPDATE public.issuer_keys SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

UPDATE public.issued_credentials
SET issued_at = COALESCE(issued_at, NOW()),
    created_at = COALESCE(created_at, NOW())
WHERE issued_at IS NULL OR created_at IS NULL;

UPDATE public.credential_shares SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

UPDATE public.org_subscriptions
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.usage_events SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

UPDATE public.data_pools
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.pool_contributions
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.data_orders SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

UPDATE public.vault_field_monetization
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.sale_preferences
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.offers SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
UPDATE public.offer_claims SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

UPDATE public.credential_requests
SET requested_at = COALESCE(requested_at, NOW())
WHERE requested_at IS NULL;

UPDATE public.notifications SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

UPDATE public.payout_accounts
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.payouts
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

UPDATE public.mfa_backup_codes SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;

ALTER TABLE public.users
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.vault_data
  ALTER COLUMN tags SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.consents
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN timestamp SET NOT NULL;
ALTER TABLE public.organizations
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.consent_requests ALTER COLUMN requested_at SET NOT NULL;
ALTER TABLE public.passkeys ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.org_members ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.issuer_keys ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.issued_credentials
  ALTER COLUMN issued_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.credential_shares ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.org_subscriptions
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.usage_events ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.data_pools
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.pool_contributions
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.data_orders ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.vault_field_monetization
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.sale_preferences
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.offers ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.offer_claims ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.credential_requests ALTER COLUMN requested_at SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.payout_accounts
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.payouts
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.mfa_backup_codes ALTER COLUMN created_at SET NOT NULL;

-- Evaluate auth.uid() once per statement instead of once per row. The policy
-- predicates and ownership boundaries remain unchanged.
ALTER POLICY "audit_select_own" ON public.audit_logs
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "cr_select_own" ON public.consent_requests
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "cr_update_own" ON public.consent_requests
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "consents_all_own" ON public.consents
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "credreq_select_own" ON public.credential_requests
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "credreq_update_own" ON public.credential_requests
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "cs_all_own" ON public.credential_shares
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "ic_select_subject" ON public.issued_credentials
  USING ((SELECT auth.uid()) = subject_user_id);
ALTER POLICY "mfa_backup_codes_select_own" ON public.mfa_backup_codes
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "notifications_select_own" ON public.notifications
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "notifications_update_own" ON public.notifications
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "offer_claims_insert_own" ON public.offer_claims
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "offer_claims_select_own" ON public.offer_claims
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "org_members_select_self" ON public.org_members
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "organizations_select_member" ON public.organizations
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_members AS member
      WHERE member.organization_id = organizations.id
        AND member.user_id = (SELECT auth.uid())
    )
  );
ALTER POLICY "passkeys_all_own" ON public.passkeys
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "payout_accounts_select_own" ON public.payout_accounts
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "payouts_select_own" ON public.payouts
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "pool_contributions_insert_own" ON public.pool_contributions
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "pool_contributions_select_own" ON public.pool_contributions
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "pool_contributions_update_own" ON public.pool_contributions
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "sale_prefs_insert_own" ON public.sale_preferences
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "sale_prefs_select_own" ON public.sale_preferences
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "sale_prefs_update_own" ON public.sale_preferences
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "users_select_own" ON public.users
  USING ((SELECT auth.uid()) = id);
ALTER POLICY "users_update_own" ON public.users
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);
ALTER POLICY "vault_all_own" ON public.vault_data
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "vfm_delete_own" ON public.vault_field_monetization
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "vfm_insert_own" ON public.vault_field_monetization
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "vfm_select_own" ON public.vault_field_monetization
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "vfm_update_own" ON public.vault_field_monetization
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Cover foreign keys reported by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS idx_audit_consent ON public.audit_logs(consent_id);
CREATE INDEX IF NOT EXISTS idx_audit_vault ON public.audit_logs(vault_data_id);
CREATE INDEX IF NOT EXISTS idx_cr_organization ON public.consent_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_ic_vault ON public.issued_credentials(vault_data_id);
CREATE INDEX IF NOT EXISTS idx_payouts_contribution ON public.payouts(contribution_id);
CREATE INDEX IF NOT EXISTS idx_payouts_pool ON public.payouts(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_contrib_vault ON public.pool_contributions(vault_data_id);
