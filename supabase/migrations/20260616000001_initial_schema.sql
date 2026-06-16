CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (synced from auth.users via trigger in next migration)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  key_salt TEXT,
  key_hint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Vault data (client-side encrypted blobs)
CREATE TABLE public.vault_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'personal',
  tags TEXT[] DEFAULT '{}',
  schema_type TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  client_ciphertext TEXT NOT NULL,
  encrypted_dek TEXT NOT NULL,
  dek_salt TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vault_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_all_own" ON public.vault_data FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_vault_user ON public.vault_data(user_id);
CREATE INDEX idx_vault_category ON public.vault_data(user_id, category);
CREATE INDEX idx_vault_created ON public.vault_data(user_id, created_at DESC);

-- Consents
CREATE TABLE public.consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vault_data_id UUID REFERENCES public.vault_data(id) ON DELETE CASCADE,
  granted_to TEXT NOT NULL,
  granted_to_name TEXT,
  granted_to_email TEXT,
  access_level TEXT NOT NULL CHECK (access_level IN ('read','export','verify')),
  purpose TEXT NOT NULL,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  consent_type TEXT NOT NULL DEFAULT 'explicit' CHECK (consent_type IN ('explicit','implied')),
  ip_address TEXT,
  user_agent TEXT,
  terms_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consents_all_own" ON public.consents FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_consents_user ON public.consents(user_id);
CREATE INDEX idx_consents_vault ON public.consents(vault_data_id);
CREATE INDEX idx_consents_end ON public.consents(end_date);

-- Audit logs (hash-chained, append-only -- inserts via service role only)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vault_data_id UUID REFERENCES public.vault_data(id) ON DELETE SET NULL,
  consent_id UUID REFERENCES public.consents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user',
  actor_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  method TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  previous_hash TEXT,
  current_hash TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_own" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_audit_user_ts ON public.audit_logs(user_id, timestamp DESC);

-- Organizations (data consumers; auth via API key, not Supabase sessions)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  website TEXT,
  api_key_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consent requests (org -> user pull model)
CREATE TABLE public.consent_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  data_category TEXT,
  purpose TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('read','export','verify')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  response_note TEXT,
  responded_at TIMESTAMPTZ
);
ALTER TABLE public.consent_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_select_own" ON public.consent_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cr_update_own" ON public.consent_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_cr_user ON public.consent_requests(user_id, status);
