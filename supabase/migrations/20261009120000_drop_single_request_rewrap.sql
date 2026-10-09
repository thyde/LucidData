-- Re-wraps now arrive in parts and are applied by apply_vault_rewrap
-- (20261009090000_staged_vault_rewrap.sql), and the code that called the
-- single-request rewrap_vault_keys is gone. Keeping it would leave a second
-- path that skips the row lock and the ingestion-key check the new one has.
DROP FUNCTION IF EXISTS public.rewrap_vault_keys(UUID, JSONB, JSONB);
