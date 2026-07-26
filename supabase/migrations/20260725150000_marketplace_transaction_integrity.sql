-- Make marketplace purchases reproducible and record the terms accepted by sellers.
-- Purchased records are snapshotted at checkout so later pool changes cannot alter
-- what the buyer paid for or which contributors are owed a payout.

ALTER TABLE public.data_pools
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'research',
  ADD COLUMN minimum_contributors INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.data_pools
  ADD CONSTRAINT data_pools_purpose_check
    CHECK (purpose IN ('research', 'ai_training', 'analytics', 'product_improvement', 'marketing', 'other')),
  ADD CONSTRAINT data_pools_minimum_contributors_check
    CHECK (minimum_contributors BETWEEN 5 AND 100000),
  ADD CONSTRAINT data_pools_retention_days_check
    CHECK (retention_days BETWEEN 1 AND 365);

ALTER TABLE public.pool_contributions
  ADD COLUMN consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN consent_version TEXT NOT NULL DEFAULT '2026-07-25',
  ADD COLUMN declared_purpose TEXT NOT NULL DEFAULT 'research';

ALTER TABLE public.pool_contributions
  ADD CONSTRAINT pool_contributions_declared_purpose_check
    CHECK (declared_purpose IN ('research', 'ai_training', 'analytics', 'product_improvement', 'marketing', 'other'));

ALTER TABLE public.data_orders
  ADD COLUMN export_expires_at TIMESTAMPTZ;

UPDATE public.data_orders
SET export_expires_at = created_at + INTERVAL '7 days'
WHERE export_expires_at IS NULL;

ALTER TABLE public.data_orders
  ALTER COLUMN export_expires_at SET DEFAULT (NOW() + INTERVAL '7 days'),
  ALTER COLUMN export_expires_at SET NOT NULL;

CREATE TABLE public.data_order_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.data_orders(id) ON DELETE CASCADE,
  source_contribution_id UUID REFERENCES public.pool_contributions(id) ON DELETE SET NULL,
  source_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  payload JSONB NOT NULL,
  payout_cents INTEGER NOT NULL CHECK (payout_cents >= 0),
  contributed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, source_contribution_id)
);

ALTER TABLE public.data_order_records ENABLE ROW LEVEL SECURITY;

-- This table deliberately has no API policy. Dataset access is service-role only
-- through the org-scoped export and payout services.
CREATE INDEX idx_data_order_records_order ON public.data_order_records(order_id);
CREATE INDEX idx_data_order_records_contribution
  ON public.data_order_records(source_contribution_id);
CREATE INDEX idx_data_order_records_user ON public.data_order_records(source_user_id);