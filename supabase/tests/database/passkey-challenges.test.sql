-- WebAuthn challenges: issued and used by the server only, used once, and
-- gone with the account they belong to.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000004c1', 'challenged@example.com');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.passkey_challenges'::regclass),
  'Row level security is on'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.passkey_challenges', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.passkey_challenges', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.passkey_challenges', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.passkey_challenges', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.passkey_challenges', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.passkey_challenges', 'DELETE'),
  'Neither API role can read, issue, or use a challenge'
);

SET LOCAL ROLE service_role;

INSERT INTO public.passkey_challenges (id, user_id, purpose, challenge, expires_at) VALUES
  ('00000000-0000-4000-8000-0000000004d1', '00000000-0000-4000-8000-0000000004c1',
   'authentication', 'Y2hhbGxlbmdlLW9uZQ', now() + interval '5 minutes'),
  ('00000000-0000-4000-8000-0000000004d2', '00000000-0000-4000-8000-0000000004c1',
   'registration', 'Y2hhbGxlbmdlLXR3bw', now() + interval '5 minutes');

-- Using a challenge is one DELETE ... RETURNING, so two requests racing for the
-- same one cannot both get it.
CREATE TEMP TABLE first_use AS
WITH used AS (
  DELETE FROM public.passkey_challenges
  WHERE id = '00000000-0000-4000-8000-0000000004d1' AND purpose = 'authentication' AND expires_at > now()
  RETURNING challenge
)
SELECT challenge FROM used;

SELECT is(
  (SELECT challenge FROM first_use),
  'Y2hhbGxlbmdlLW9uZQ',
  'The server uses a challenge it issued'
);

SELECT is_empty(
  $$
    DELETE FROM public.passkey_challenges
    WHERE id = '00000000-0000-4000-8000-0000000004d1' AND purpose = 'authentication' AND expires_at > now()
    RETURNING challenge
  $$,
  'A challenge cannot be used twice'
);

SELECT throws_ok(
  $$
    INSERT INTO public.passkey_challenges (user_id, purpose, challenge, expires_at)
    VALUES ('00000000-0000-4000-8000-0000000004c1', 'recovery', 'Y2hhbGxlbmdl', now())
  $$,
  '23514',
  NULL,
  'A challenge is for signing in or registering, nothing else'
);

SELECT throws_ok(
  $$
    INSERT INTO public.passkey_challenges (user_id, purpose, challenge, expires_at)
    VALUES ('00000000-0000-4000-8000-0000000004c1', 'authentication', '', now())
  $$,
  '23514',
  NULL,
  'A challenge cannot be empty'
);

RESET ROLE;

DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000004c1';

SELECT is(
  (SELECT count(*)::int FROM public.passkey_challenges
   WHERE user_id = '00000000-0000-4000-8000-0000000004c1'),
  0,
  'Deleting the account deletes its challenges'
);

SELECT * FROM finish();
ROLLBACK;
