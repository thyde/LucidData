-- Billing scaffold: per-org subscription plan + metered usage events.
-- Stripe identifiers are stored for a future checkout integration; the plan and
-- usage tracking work without Stripe so quotas can be enforced today.

CREATE TABLE public.org_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'growth', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('credential_issued', 'credential_verified')),
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Both tables are service-role only; org members read aggregates via guarded actions.
CREATE INDEX idx_usage_org_created ON public.usage_events(organization_id, created_at DESC);
CREATE INDEX idx_usage_org_type ON public.usage_events(organization_id, event_type);
