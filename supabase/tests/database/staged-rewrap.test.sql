-- A re-wrap sent in parts waits in vault_rewrap_entries until one call applies
-- it. Only the server touches either table, and the apply moves every entry
-- and the ingestion key together or nothing at all.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000002a1', 'mover@example.com'),
  ('00000000-0000-4000-8000-0000000002a2', 'bystander@example.com');

INSERT INTO public.vault_data (id, user_id, label, category, schema_type, client_ciphertext, encrypted_dek, dek_salt) VALUES
  ('00000000-0000-4000-8000-0000000002f1', '00000000-0000-4000-8000-0000000002a1', 'One', 'personal', 'custom', 'c1', 'old-dek-1', 'iv1'),
  ('00000000-0000-4000-8000-0000000002f2', '00000000-0000-4000-8000-0000000002a1', 'Two', 'personal', 'custom', 'c2', 'old-dek-2', 'iv2'),
  ('00000000-0000-4000-8000-0000000002f3', '00000000-0000-4000-8000-0000000002a1', 'Three', 'personal', 'custom', 'c3', 'old-dek-3', 'iv3'),
  ('00000000-0000-4000-8000-0000000002f9', '00000000-0000-4000-8000-0000000002a2', 'Theirs', 'personal', 'custom', 'c9', 'their-dek', 'iv9');
UPDATE public.users SET wrapped_ingest_private_key = 'old-ingest' WHERE id = '00000000-0000-4000-8000-0000000002a1';

-- 1. Nobody but the server ---------------------------------------------------

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.vault_rewraps', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.vault_rewraps', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.vault_rewrap_entries', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.vault_rewrap_entries', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.vault_rewrap_entries', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.vault_rewraps', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.vault_rewrap_entries', 'INSERT'),
  'Neither API role holds a privilege on the staged re-wrap tables'
);

SELECT ok(
  has_function_privilege('service_role', 'public.apply_vault_rewrap(uuid, uuid, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.apply_vault_rewrap(uuid, uuid, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.apply_vault_rewrap(uuid, uuid, jsonb)', 'EXECUTE'),
  'Only the server can apply a re-wrap, after its step-up check'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000002a1", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ SELECT * FROM public.vault_rewraps $$,
  '42501',
  NULL,
  'A person cannot read re-wraps directly'
);

SELECT throws_ok(
  $$ INSERT INTO public.vault_rewrap_entries (rewrap_id, vault_data_id, encrypted_dek, dek_salt, previous_encrypted_dek)
     VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000002f1', 'planted', 'p', 'old-dek-1') $$,
  '42501',
  NULL,
  'A person cannot stage an envelope directly'
);

RESET ROLE;

-- 2. The apply refuses anything short of the whole vault, as read -----------

SET LOCAL ROLE service_role;

INSERT INTO public.vault_rewraps (id, user_id, reason) VALUES
  ('00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000002a1', 'password_change');
INSERT INTO public.vault_rewrap_entries (rewrap_id, vault_data_id, encrypted_dek, dek_salt, previous_encrypted_dek) VALUES
  ('00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000002f1', 'new-dek-1', 'n1', 'old-dek-1'),
  ('00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000002f2', 'new-dek-2', 'n2', 'old-dek-2');

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b1') $$,
  'PT409',
  'The vault changed after it was read',
  'A re-wrap missing an entry is refused'
);

INSERT INTO public.vault_rewrap_entries (rewrap_id, vault_data_id, encrypted_dek, dek_salt, previous_encrypted_dek) VALUES
  ('00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000002f3', 'new-dek-3', 'n3', 'edited-elsewhere');

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b1') $$,
  'PT409',
  'A vault entry changed after it was read',
  'An entry edited since it was read stops the whole re-wrap'
);

SELECT is(
  (SELECT encrypted_dek FROM public.vault_data WHERE id = '00000000-0000-4000-8000-0000000002f1'),
  'old-dek-1',
  'and the entries that did match are left as they were'
);

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a2', '00000000-0000-4000-8000-0000000002b1') $$,
  'PT410',
  'The re-wrap has expired or does not exist',
  'Nobody can apply another person''s re-wrap'
);

INSERT INTO public.vault_rewraps (id, user_id, reason, expires_at) VALUES
  ('00000000-0000-4000-8000-0000000002b2', '00000000-0000-4000-8000-0000000002a1', 'recovery', NOW() - INTERVAL '1 minute');

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b2') $$,
  'PT410',
  'The re-wrap has expired or does not exist',
  'An expired re-wrap is refused'
);

-- Another person's entry staged in place of one of the mover's.
INSERT INTO public.vault_rewraps (id, user_id, reason) VALUES
  ('00000000-0000-4000-8000-0000000002b3', '00000000-0000-4000-8000-0000000002a1', 'password_change');
INSERT INTO public.vault_rewrap_entries (rewrap_id, vault_data_id, encrypted_dek, dek_salt, previous_encrypted_dek) VALUES
  ('00000000-0000-4000-8000-0000000002b3', '00000000-0000-4000-8000-0000000002f1', 'new-dek-1', 'n1', 'old-dek-1'),
  ('00000000-0000-4000-8000-0000000002b3', '00000000-0000-4000-8000-0000000002f2', 'new-dek-2', 'n2', 'old-dek-2'),
  ('00000000-0000-4000-8000-0000000002b3', '00000000-0000-4000-8000-0000000002f9', 'hijacked', 'h', 'their-dek');

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b3') $$,
  'PT409',
  'A vault entry changed after it was read',
  'Another person''s entry in a re-wrap stops it'
);

SELECT is(
  (SELECT encrypted_dek FROM public.vault_data WHERE id = '00000000-0000-4000-8000-0000000002f9'),
  'their-dek',
  'and their entry is untouched'
);

UPDATE public.vault_rewrap_entries
SET previous_encrypted_dek = 'old-dek-3'
WHERE rewrap_id = '00000000-0000-4000-8000-0000000002b1'
  AND vault_data_id = '00000000-0000-4000-8000-0000000002f3';

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b1',
       '{"previous": "not-the-stored-key", "wrapped": "new-ingest"}'::jsonb) $$,
  'PT409',
  'The ingestion key changed after it was read',
  'An ingestion key that changed since it was read stops the whole re-wrap'
);

-- 3. A complete re-wrap moves everything at once ----------------------------

SELECT is(
  public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b1',
    '{"previous": "old-ingest", "wrapped": "new-ingest"}'::jsonb),
  3,
  'A re-wrap that matches what is stored goes through and counts every entry'
);

SELECT ok(
  (SELECT bool_and(encrypted_dek LIKE 'new-dek-%') FROM public.vault_data WHERE user_id = '00000000-0000-4000-8000-0000000002a1')
    AND (SELECT wrapped_ingest_private_key FROM public.users WHERE id = '00000000-0000-4000-8000-0000000002a1') = 'new-ingest',
  'and moves every envelope and the ingestion key together'
);

SELECT is(
  (SELECT count(*)::int FROM public.vault_rewraps WHERE id = '00000000-0000-4000-8000-0000000002b1')
    + (SELECT count(*)::int FROM public.vault_rewrap_entries WHERE rewrap_id = '00000000-0000-4000-8000-0000000002b1'),
  0,
  'and clears what was staged'
);

SELECT throws_ok(
  $$ SELECT public.apply_vault_rewrap('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b1') $$,
  'PT410',
  'The re-wrap has expired or does not exist',
  'A re-wrap applies once'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
