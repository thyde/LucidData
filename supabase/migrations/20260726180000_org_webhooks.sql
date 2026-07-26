-- LD-602 organization developer surface: outbound webhooks.
--
-- Organizations integrate through APIs, and without webhooks every buyer polls.
-- Polling is both a cost we pay and a delay they feel, so this adds signed
-- outbound delivery with retries on the LD-601 runner.
--
-- The secret is stored hashed, exactly like an API key. A webhook secret in
-- plaintext is a forged-callback kit for anyone who reaches the database.

CREATE TABLE IF NOT EXISTS public.org_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_prefix TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only https, and never a bare host. Checked again in application code
  -- against internal address ranges, which SQL cannot resolve.
  CONSTRAINT org_webhooks_url_https CHECK (url LIKE 'https://%'),
  CONSTRAINT org_webhooks_events_not_empty CHECK (array_length(events, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_org_webhooks_org
  ON public.org_webhooks(organization_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.org_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  response_status INTEGER,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON public.webhook_deliveries(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON public.webhook_deliveries(webhook_id, created_at DESC);

-- Members read their own organization's webhooks and delivery history so they
-- can see a failing endpoint without asking us. Writes go through the service
-- role, because a member must not be able to point a webhook somewhere new
-- without the URL passing the address checks in application code.
ALTER TABLE public.org_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organization webhooks"
  ON public.org_webhooks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.organization_id = organization_id AND m.user_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organization deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_webhooks w
      JOIN public.org_members m ON m.organization_id = w.organization_id
      WHERE w.id = webhook_id AND m.user_id = (SELECT auth.uid())
    )
  );

-- The secret hash must never be reachable through the API, and a delivery row
-- must never be editable by a member.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.org_webhooks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.webhook_deliveries FROM anon, authenticated;

COMMENT ON TABLE public.org_webhooks IS
  'LD-602 outbound webhook endpoints. Secrets are stored hashed; the plaintext is shown once at creation.';

COMMENT ON TABLE public.webhook_deliveries IS
  'LD-602 delivery attempts with backoff. Payloads carry identifiers and timestamps only, never personal data.';
