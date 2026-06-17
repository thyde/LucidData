-- Data marketplace: lets individuals opt vault fields into anonymized contribution
-- pools that bulk-data buyers purchase. Buyers are existing organizations with the
-- data_buyer capability. Payments are stubbed (orders are recorded, never charged);
-- Stripe wiring can come later like the billing scaffold.
--
-- Anonymization happens in the browser at contribution time: the client decrypts the
-- user-approved fields, strips identifiers, and submits a server-readable payload.
-- These tables therefore store plaintext anonymized payloads on purpose; the source
-- vault rows stay end-to-end encrypted.

-- 1. Buyer capability flag on organizations.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS data_buyer BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Data pools: a buyer-defined data request (the "dataset" buyers shop for).
CREATE TABLE public.data_pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'personal'
    CHECK (category IN ('personal', 'health', 'financial', 'credentials', 'location', 'interests', 'browsing', 'other')),
  requested_fields TEXT[] NOT NULL DEFAULT '{}',
  pricing_model TEXT NOT NULL DEFAULT 'snapshot'
    CHECK (pricing_model IN ('snapshot', 'subscription', 'filtered')),
  price_cents INTEGER NOT NULL DEFAULT 0,
  price_per_record_cents INTEGER NOT NULL DEFAULT 0,
  filters JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.data_pools ENABLE ROW LEVEL SECURITY;

-- Individuals browse open pools to decide what to contribute. Buyer-side management
-- (create/close, read own closed pools) goes through the withOrgMember guard + service role.
CREATE POLICY "data_pools_select_open" ON public.data_pools
  FOR SELECT USING (status = 'open');

CREATE INDEX idx_data_pools_buyer ON public.data_pools(buyer_org_id, created_at DESC);
CREATE INDEX idx_data_pools_status_category ON public.data_pools(status, category);

-- 3. Pool contributions: a user's anonymized, server-readable contribution to a pool,
-- derived in the browser from one vault entry's approved fields.
CREATE TABLE public.pool_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES public.data_pools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vault_data_id UUID REFERENCES public.vault_data(id) ON DELETE SET NULL,
  anonymized_payload JSONB NOT NULL,
  category TEXT NOT NULL DEFAULT 'personal',
  payout_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.pool_contributions ENABLE ROW LEVEL SECURITY;

-- Owners manage their own contributions. Buyers only ever read contributions they have
-- purchased, which is mediated by the service role inside a guarded order/export action.
CREATE POLICY "pool_contributions_select_own" ON public.pool_contributions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pool_contributions_insert_own" ON public.pool_contributions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pool_contributions_update_own" ON public.pool_contributions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_pool_contrib_user ON public.pool_contributions(user_id, created_at DESC);
CREATE INDEX idx_pool_contrib_pool ON public.pool_contributions(pool_id, status);

-- 4. Data orders: a buyer's purchase of a pool snapshot or subscription. Stub-paid.
-- Service-role only; buyers read their own orders through guarded actions.
CREATE TABLE public.data_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES public.data_pools(id) ON DELETE CASCADE,
  buyer_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL DEFAULT 'snapshot' CHECK (order_type IN ('snapshot', 'subscription')),
  record_count INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'canceled')),
  current_period_end TIMESTAMPTZ,
  export_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.data_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_data_orders_buyer ON public.data_orders(buyer_org_id, created_at DESC);
CREATE INDEX idx_data_orders_pool ON public.data_orders(pool_id);

-- 5. Per-field monetization: which fields of a vault entry the user has opted into
-- selling. Stores field keys + category only (never the encrypted values), driving the
-- $/lock indicators in the vault and the eligible field set for contributions.
CREATE TABLE public.vault_field_monetization (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_data_id UUID NOT NULL REFERENCES public.vault_data(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'personal',
  opted_in BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (vault_data_id, field_key)
);
ALTER TABLE public.vault_field_monetization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vfm_select_own" ON public.vault_field_monetization
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vfm_insert_own" ON public.vault_field_monetization
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vfm_update_own" ON public.vault_field_monetization
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vfm_delete_own" ON public.vault_field_monetization
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_vfm_user ON public.vault_field_monetization(user_id);
CREATE INDEX idx_vfm_vault ON public.vault_field_monetization(vault_data_id);

-- 6. Sale preferences: how/who a user is willing to sell to.
CREATE TABLE public.sale_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  allowed_purposes TEXT[] NOT NULL DEFAULT '{}',
  blocked_buyer_orgs UUID[] NOT NULL DEFAULT '{}',
  min_price_cents INTEGER NOT NULL DEFAULT 0,
  auto_optin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sale_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_prefs_select_own" ON public.sale_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sale_prefs_insert_own" ON public.sale_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sale_prefs_update_own" ON public.sale_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. Offers: incentives buyers present to users (e.g. a discount for sharing a category).
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  incentive TEXT NOT NULL,
  target_category TEXT NOT NULL DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see active offers on their dashboard. Buyer-side
-- create/close goes through the withOrgMember guard + service role.
CREATE POLICY "offers_select_active" ON public.offers
  FOR SELECT USING (status = 'active');

CREATE INDEX idx_offers_buyer ON public.offers(buyer_org_id, created_at DESC);
CREATE INDEX idx_offers_status_category ON public.offers(status, target_category);

-- 8. Offer claims: a user accepted an offer. Recording only (no auto-consent).
CREATE TABLE public.offer_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (offer_id, user_id)
);
ALTER TABLE public.offer_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_claims_select_own" ON public.offer_claims
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "offer_claims_insert_own" ON public.offer_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_offer_claims_user ON public.offer_claims(user_id);
