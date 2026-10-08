-- LD-610: the key salt is written once.
--
-- The vault's master key is derived in the browser from the password and
-- users.key_salt. Password change and recovery both keep the salt and re-wrap
-- the data keys instead, so nothing legitimate ever changes it after it is set.
-- Overwriting it would leave every entry undecryptable, and the users_update_own
-- policy lets a signed-in browser update its own row directly through the API,
-- so the rule is enforced here rather than only in application code.

CREATE OR REPLACE FUNCTION public.prevent_key_salt_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.key_salt IS NOT NULL AND NEW.key_salt IS DISTINCT FROM OLD.key_salt THEN
    RAISE EXCEPTION 'key_salt cannot change once it is set'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_key_salt_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_key_salt_write_once ON public.users;
CREATE TRIGGER users_key_salt_write_once
  BEFORE UPDATE OF key_salt ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_key_salt_change();
