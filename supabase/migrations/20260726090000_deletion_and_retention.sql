-- LD-607 retention and deletion completeness.
--
-- Two problems this migration exists to fix:
--   1. issued_credentials.subject_user_id and data_order_records.source_user_id
--      are ON DELETE SET NULL, so a deleted user's claims and contributed
--      payloads survive erasure with a nulled key beside intact personal data.
--      Deletion is now explicit in lib/services/deletion.service.ts; this adds
--      the columns that record a redaction rather than pretending it happened.
--   2. Nothing enforced retention. The indexes below make the purge queries in
--      lib/services/retention.service.ts cheap enough to run every sweep.

-- Records that must outlive their contributor, because a buyer paid for the
-- dataset and data_orders.record_count has to stay consistent, are stripped to
-- non-identifying fields instead of deleted. redacted_at is the evidence.
ALTER TABLE public.data_order_records
  ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.data_order_records.redacted_at IS
  'Set when the contributor erased their account. payload is emptied and source ids are cleared; the row survives only as a counted, category-tagged placeholder.';

CREATE INDEX IF NOT EXISTS idx_data_order_records_source_user
  ON public.data_order_records(source_user_id)
  WHERE source_user_id IS NOT NULL;

-- Evidence of erasure. Deliberately has NO foreign key to users: the row has to
-- outlive the account it describes, otherwise the receipt disappears with the
-- thing it proves. It stores a pseudonymous subject id and a hash of the email,
-- never the address itself.
CREATE TABLE IF NOT EXISTS public.deletion_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  subject_email_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  key_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_receipts_subject
  ON public.deletion_receipts(subject_id);

-- Service-role only. There is no session left to scope a policy to, and the
-- receipt is verified by id through a public route rather than by query.
ALTER TABLE public.deletion_receipts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.deletion_receipts IS
  'LD-607 signed proof that an account was erased. No FK to users by design: it must survive the deletion it attests to.';

-- Retention sweep support. Each index matches the WHERE clause of one purge.
CREATE INDEX IF NOT EXISTS idx_consent_requests_responded_at
  ON public.consent_requests(responded_at)
  WHERE responded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consent_requests_expires_at
  ON public.consent_requests(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credential_requests_responded_at
  ON public.credential_requests(responded_at)
  WHERE responded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credential_requests_expires_at
  ON public.credential_requests(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credential_shares_expired_at
  ON public.credential_shares(expired_at)
  WHERE expired_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_data_orders_export_expires_at
  ON public.data_orders(export_expires_at);
