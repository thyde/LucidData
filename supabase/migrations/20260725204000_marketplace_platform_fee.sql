-- LD-505 marketplace pricing and platform fee.
--
-- The marketplace loses money as pools grow: LucidData kept only the fixed
-- access fee while the payment processor took a percentage of the whole
-- transaction. Break-even for the financial category was around 1,100 records,
-- and interests / other lost money on every sale.
--
-- This records the fee explicitly on every payout, and pins the fee rate to each
-- contribution at consent time so a later change never alters agreed terms.

ALTER TABLE public.payouts
  -- What the buyer paid for this record, before the platform fee.
  ADD COLUMN IF NOT EXISTS gross_cents INTEGER NOT NULL DEFAULT 0,
  -- What LucidData retained.
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  -- The rate that applied, in basis points, kept for the record.
  ADD COLUMN IF NOT EXISTS fee_bps INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing payouts were paid gross with no fee taken.
UPDATE public.payouts
SET gross_cents = amount_cents
WHERE gross_cents = 0;

-- The fee rate the contributor agreed to. Pinned at consent time so changing the
-- platform fee cannot retroactively reduce what an existing contribution earns.
ALTER TABLE public.pool_contributions
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 0;

-- Enforce the minimum order value in the database as well as the service, so no
-- path can create an order that cannot cover its own processing cost.
ALTER TABLE public.data_orders
  DROP CONSTRAINT IF EXISTS data_orders_total_cents_minimum;
ALTER TABLE public.data_orders
  ADD CONSTRAINT data_orders_total_cents_minimum
  CHECK (total_cents = 0 OR total_cents >= 5000);
