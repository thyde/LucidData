-- Email notification preference.
--
-- In-app notifications are always created; this flag only gates the optional
-- best-effort email copy sent through the EMAIL_TRANSPORT seam
-- (console / smtp / resend). It defaults to TRUE so that once an operator
-- configures a transport, existing users receive email by default; until a
-- transport is configured the send path is a no-op regardless of this flag.
--
-- The column is read server-side with the service role when a notification is
-- created for another user (e.g. an organization notifying an individual), and
-- read/updated by the owner via the existing users_select_own / users_update_own
-- RLS policies, so no new policies are required.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
