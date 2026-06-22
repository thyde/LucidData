-- Real Stripe payment for marketplace data orders.
-- Orders now start 'pending' and are flipped to 'paid' by the Stripe webhook once
-- Checkout completes. Free pools (total 0) and the no-Stripe dev fallback still
-- complete immediately. data_orders stays service-role only (no RLS policies);
-- buyers read their own orders through guarded actions.

ALTER TABLE public.data_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

ALTER TABLE public.data_orders DROP CONSTRAINT IF EXISTS data_orders_status_check;
ALTER TABLE public.data_orders
  ADD CONSTRAINT data_orders_status_check
  CHECK (status IN ('pending', 'paid', 'refunded', 'canceled', 'payment_failed'));

ALTER TABLE public.data_orders ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_data_orders_checkout_session
  ON public.data_orders(stripe_checkout_session_id);
