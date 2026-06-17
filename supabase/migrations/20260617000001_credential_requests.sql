-- Credential requests (org -> user pull model for verifiable credentials).
-- An organization (e.g. an employer) asks a user to share specific credentials
-- identified by schema type (e.g. education, employment). The user fulfills the
-- request by creating credential_shares the organization can then verify.
CREATE TABLE public.credential_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  requested_schema_types TEXT[] NOT NULL DEFAULT '{}',
  message TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','denied','expired')),
  response_note TEXT,
  responded_at TIMESTAMPTZ
);
ALTER TABLE public.credential_requests ENABLE ROW LEVEL SECURITY;

-- Subjects manage their own incoming requests. Organizations read/create their
-- own requests through the service role (server actions gated by org membership).
CREATE POLICY "credreq_select_own" ON public.credential_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "credreq_update_own" ON public.credential_requests
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_credreq_user ON public.credential_requests(user_id, status);
CREATE INDEX idx_credreq_org ON public.credential_requests(organization_id, status);

-- Link a fulfilled share back to the request that prompted it so the requesting
-- organization can view exactly what was disclosed for that request.
ALTER TABLE public.credential_shares
  ADD COLUMN credential_request_id UUID REFERENCES public.credential_requests(id) ON DELETE SET NULL;
CREATE INDEX idx_cs_request ON public.credential_shares(credential_request_id);

-- Surface new requests to the signed-in subject in realtime, like consent_requests.
ALTER PUBLICATION supabase_realtime ADD TABLE public.credential_requests;
