-- Stripe Connect payouts. Contributors onboard a Stripe Express account and
-- receive a transfer for their share whenever a buyer purchases a pool they
-- contributed to. Both tables are written by the service role; users read their
-- own rows via RLS.

CREATE TABLE public.payout_accounts (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payout_accounts_select_own" ON public.payout_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contribution_id UUID REFERENCES public.pool_contributions(id) ON DELETE SET NULL,
  data_order_id UUID REFERENCES public.data_orders(id) ON DELETE SET NULL,
  pool_id UUID REFERENCES public.data_pools(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  stripe_transfer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_select_own" ON public.payouts
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_payouts_user ON public.payouts(user_id, created_at DESC);
CREATE INDEX idx_payouts_user_status ON public.payouts(user_id, status);
CREATE INDEX idx_payouts_order ON public.payouts(data_order_id);
