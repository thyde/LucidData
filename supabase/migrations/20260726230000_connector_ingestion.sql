-- LD-201 connector framework with zero-knowledge ingestion.
--
-- The adoption problem is that a new vault is empty and stays empty. The hard
-- constraint is that a background sync runs with nobody present, so it cannot
-- hold the master key. It must write ciphertext it cannot read.
--
-- Hence three additions:
--   users.ingest_public_key      what the worker seals to
--   data_sources                 a connected provider, with its tokens
--   pending_ingest               sealed records waiting for the next unlock
--
-- Provider tokens are the deliberate, disclosed exception to browser-held keys.
-- The worker has to call the provider, so it needs them. They are encrypted at
-- rest with a server-held secret, the same pattern issuer keys already use, and
-- the trust centre says so rather than implying every key is yours.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ingest_public_key TEXT,
  ADD COLUMN IF NOT EXISTS wrapped_ingest_private_key TEXT,
  ADD COLUMN IF NOT EXISTS ingest_key_salt TEXT;

COMMENT ON COLUMN public.users.ingest_public_key IS
  'LD-201 ECDH P-256 public key a sync worker seals records to. Public by design.';

COMMENT ON COLUMN public.users.wrapped_ingest_private_key IS
  'LD-201 the private half, wrapped with the master key. The server cannot unwrap it.';

CREATE TABLE IF NOT EXISTS public.data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'error', 'disconnected')),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  provider_account_id TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One live connection per provider per person. Reconnecting replaces.
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_data_sources_user
  ON public.data_sources(user_id);

CREATE INDEX IF NOT EXISTS idx_data_sources_syncable
  ON public.data_sources(last_synced_at)
  WHERE status = 'connected';

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

-- A person can see and disconnect their own sources. They cannot write a token,
-- because a token they could write is a token they could point at someone
-- else's account.
CREATE POLICY "Users read their own data sources"
  ON public.data_sources FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users disconnect their own data sources"
  ON public.data_sources FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE ON TABLE public.data_sources FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.pending_ingest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  -- Sealed to users.ingest_public_key. Unreadable to us by construction.
  sealed_payload TEXT NOT NULL,
  schema_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'health',
  provider_record_id TEXT NOT NULL,
  label TEXT NOT NULL,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Re-running a sync must not create a second copy of the same record.
  UNIQUE (data_source_id, provider_record_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_ingest_user
  ON public.pending_ingest(user_id, created_at);

ALTER TABLE public.pending_ingest ENABLE ROW LEVEL SECURITY;

-- The browser reads its own sealed rows, opens them, writes real vault entries,
-- then deletes them. It never needs to write one.
CREATE POLICY "Users read their own pending ingest"
  ON public.pending_ingest FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users clear their own pending ingest"
  ON public.pending_ingest FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE ON TABLE public.pending_ingest FROM anon, authenticated;

COMMENT ON TABLE public.pending_ingest IS
  'LD-201 records a sync worker sealed to the person''s ingestion public key. Opened in the browser after unlock, then deleted.';
