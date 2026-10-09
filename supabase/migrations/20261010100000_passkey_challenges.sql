-- WebAuthn challenges, held by the server.
--
-- A passkey ceremony signs a random challenge. Until now the challenge lived
-- only in a cookie, so the server could not tell whether it had issued one,
-- when, or whether it had been used already. Someone holding a copy of one
-- sign-in request could send it again with the cookie set by hand and get a
-- new sign-in link each time. Synced passkeys report a signature counter of
-- zero, so the counter never caught it.
--
-- Each challenge is now a row, issued for one ceremony and one account,
-- deleted as it is used, and refused once it expires. The cookie holds only
-- the row's id.

CREATE TABLE public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('authentication', 'registration')),
  challenge text NOT NULL CHECK (length(challenge) > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policy, and no table privileges for the API roles: only the
-- service role issues and uses challenges.
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.passkey_challenges FROM anon, authenticated;

CREATE INDEX idx_passkey_challenges_user_id ON public.passkey_challenges(user_id);
CREATE INDEX idx_passkey_challenges_expires_at ON public.passkey_challenges(expires_at);

COMMENT ON TABLE public.passkey_challenges IS
  'WebAuthn challenges the server issued. Each is used once, for the ceremony and account it names, before expires_at.';
