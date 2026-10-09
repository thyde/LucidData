-- One audit chain per person. An insert must link to the person's head, the
-- head moves with it, and the ends of branches written before are sealed into
-- the chain by an entry whose hashed action lists them.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(40);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000003a1', 'chain@example.com'),
  ('00000000-0000-4000-8000-0000000003a2', 'branched@example.com'),
  ('00000000-0000-4000-8000-0000000003a3', 'other@example.com'),
  ('00000000-0000-4000-8000-0000000003a4', 'new@example.com'),
  ('00000000-0000-4000-8000-0000000003a5', 'straight@example.com'),
  ('00000000-0000-4000-8000-0000000003a6', 'future@example.com');

-- 1. Who can touch the heads ----------------------------------------------

SELECT ok(
  has_table_privilege('authenticated', 'public.audit_chain_heads', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.audit_chain_heads', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.audit_chain_heads', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.audit_chain_heads', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.audit_chain_heads', 'SELECT'),
  'A person may read heads, under the select policy, and only the server writes them'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.seal_audit_chain_ends(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.seal_audit_chain_ends(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.seal_audit_chain_ends(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.audit_logs_keep_one_chain()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.audit_entry_hash(text, text, uuid, timestamptz, text)', 'EXECUTE'),
  'Neither API role can seal a log or call the chain functions'
);

SELECT has_trigger('public', 'audit_logs', 'audit_logs_keep_one_chain', 'Every insert into audit_logs passes the chain check');

SELECT ok(
  has_function_privilege('service_role', 'public.append_audit_log(uuid, text, text, uuid, uuid, text, text, text, text, text, text, boolean, text, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.append_audit_log(uuid, text, text, uuid, uuid, text, text, text, text, text, text, boolean, text, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.append_audit_log(uuid, text, text, uuid, uuid, text, text, text, text, text, text, boolean, text, jsonb)', 'EXECUTE'),
  'Only the server appends through the function'
);

-- 2. The hash is the one JavaScript computes ---------------------------------
-- Vectors from createAuditHash in lib/crypto/hashing.ts.

SELECT is(
  public.audit_entry_hash(NULL, 'data_created', '00000000-0000-4000-8000-0000000003a1', '2026-10-09T12:34:56.789Z', 'Created vault entry'),
  '34a1f2293f605713d3eb7d2a1057a5db5b2a9acf59c034e3afc55ea41b9237b7',
  'Hashes an entry exactly as createAuditHash does'
);

SELECT is(
  public.audit_entry_hash('', 'data_created', '00000000-0000-4000-8000-0000000003a1', '2026-10-09T12:34:56.789Z', 'Created vault entry'),
  '34a1f2293f605713d3eb7d2a1057a5db5b2a9acf59c034e3afc55ea41b9237b7',
  'Treats an empty link as none, as JavaScript does'
);

SELECT is(
  public.audit_entry_hash(
    'abc',
    'consent_granted',
    '00000000-0000-4000-8000-0000000003a1',
    '2026-01-02T03:04:05.006Z',
    'He said "hi" \ path' || chr(10) || 'next' || chr(9) || 'tab ' || chr(233) || ' ' || chr(20013) || ' '
      || chr(1) || ' ' || chr(31) || ' ' || chr(127) || ' / ' || chr(8232)
  ),
  '549821998683314f89e92ba9d4b087c951d3829a452ec313baa7942057761535',
  'Escapes quotes, backslashes, and control characters as JSON.stringify does'
);

-- 3. Appends cannot branch -----------------------------------------------------

SELECT lives_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
     VALUES ('00000000-0000-4000-8000-0000000003a1', 'data_created', 'first', NULL, 'c1') $$,
  'A first entry links to nothing'
);

SELECT is(
  (SELECT head_hash FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a1'),
  'c1',
  'The first entry becomes the head'
);

SELECT lives_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
     VALUES ('00000000-0000-4000-8000-0000000003a1', 'data_created', 'second', 'c1', 'c2') $$,
  'An entry linked to the head is accepted'
);

SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
     VALUES ('00000000-0000-4000-8000-0000000003a1', 'data_created', 'branch', 'c1', 'c3') $$,
  'PT409',
  'The audit chain has moved on. Read its head again and retry.',
  'An entry linked to an older entry is refused, so the chain cannot branch'
);

SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
     VALUES ('00000000-0000-4000-8000-0000000003a1', 'data_created', 'restart', NULL, 'c4') $$,
  'PT409',
  NULL,
  'A second first entry is refused'
);

SELECT is(
  (SELECT head_hash FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a1'),
  'c2',
  'A refused entry leaves the head where it was'
);

SELECT lives_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash) VALUES
       ('00000000-0000-4000-8000-0000000003a1', 'data_created', 'third', 'c2', 'c5'),
       ('00000000-0000-4000-8000-0000000003a1', 'data_created', 'fourth', 'c5', 'c6') $$,
  'Rows inserted together are checked in order, so a chained batch is accepted'
);

SELECT is(
  (SELECT head_hash FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a1'),
  'c6',
  'The head follows the batch to its last entry'
);

SELECT lives_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
     VALUES ('00000000-0000-4000-8000-0000000003a3', 'data_created', 'theirs', NULL, 'o1') $$,
  'Each person has a chain of their own'
);

-- 4. Appending through the function -----------------------------------------------

CREATE TEMP TABLE appended AS
SELECT * FROM public.append_audit_log(
  '00000000-0000-4000-8000-0000000003a1', 'data_accessed', 'Read an entry',
  p_metadata => '{"vault_data_ids": ["x"]}'::jsonb
);

SELECT is((SELECT previous_hash FROM appended), 'c6', 'An append links to the head');
SELECT is(
  (SELECT current_hash FROM appended),
  (SELECT public.audit_entry_hash(previous_hash, event_type, user_id, "timestamp", action) FROM appended),
  'An append is hashed as JavaScript hashes it, over the time it stored'
);
SELECT ok(
  (SELECT "timestamp" = date_trunc('milliseconds', "timestamp") AND actor_id = user_id::text AND actor_type = 'user' AND success FROM appended),
  'An append keeps the time to the millisecond and fills the actor as the server always has'
);
SELECT is(
  (SELECT head_hash FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a1'),
  (SELECT current_hash FROM appended),
  'An append moves the head'
);
SELECT is(
  (SELECT previous_hash FROM public.append_audit_log('00000000-0000-4000-8000-0000000003a1', 'data_accessed', 'Read another')),
  (SELECT current_hash FROM appended),
  'The next append links to the one before'
);
SELECT is(
  (SELECT previous_hash FROM public.append_audit_log('00000000-0000-4000-8000-0000000003a4', 'account_created', 'Signed up')),
  NULL,
  'A first append links to nothing'
);

-- As the server calls it: its own role, through PostgREST.
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ SELECT public.append_audit_log('00000000-0000-4000-8000-0000000003a4', 'data_accessed', 'Read as the server') $$,
  'The server''s role can append, hashing included'
);
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
     VALUES ('00000000-0000-4000-8000-0000000003a4', 'data_accessed', 'stale', NULL, 'x1') $$,
  'PT409',
  NULL,
  'The server''s role cannot insert an entry that skips the head'
);
RESET ROLE;

-- 5. Sealing the ends of a log that branched before ------------------------------

-- The way the old append could branch: two entries link to b1, and b3 goes on.
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_keep_one_chain;
INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash, "timestamp") VALUES
  ('00000000-0000-4000-8000-0000000003a2', 'data_created', 'one', NULL, 'b1', '2026-01-01T00:00:01Z'),
  ('00000000-0000-4000-8000-0000000003a2', 'data_created', 'two', 'b1', 'b2', '2026-01-01T00:00:02Z'),
  ('00000000-0000-4000-8000-0000000003a2', 'data_created', 'three', 'b1', 'b3', '2026-01-01T00:00:03Z'),
  ('00000000-0000-4000-8000-0000000003a2', 'data_created', 'four', 'b3', 'b4', '2026-01-01T00:00:04Z');
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_keep_one_chain;
-- No head, as for every log before this migration.
DELETE FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a2';

SELECT is(public.seal_audit_chain_ends('00000000-0000-4000-8000-0000000003a2'), 1, 'One earlier end is sealed');

CREATE TEMP TABLE seal AS
SELECT * FROM public.audit_logs
WHERE user_id = '00000000-0000-4000-8000-0000000003a2' AND event_type = 'audit_chain_sealed';

SELECT is((SELECT count(*)::int FROM seal), 1, 'The log gains one sealing entry');
SELECT is((SELECT previous_hash FROM seal), 'b4', 'The seal links to the newest end');
SELECT is(
  (SELECT action FROM seal),
  'Sealed 1 earlier branch end of this log: b2',
  'The seal names the other end in its action, which the hash covers'
);
SELECT is(
  (SELECT current_hash FROM seal),
  (SELECT public.audit_entry_hash(previous_hash, event_type, user_id, "timestamp", action) FROM seal),
  'The seal is hashed like any other entry'
);
SELECT is(
  (SELECT head_hash FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a2'),
  (SELECT current_hash FROM seal),
  'The seal becomes the head'
);
SELECT is(public.seal_audit_chain_ends('00000000-0000-4000-8000-0000000003a2'), 0, 'Sealing again finds a single end and adds nothing');
SELECT lives_ok(
  format(
    $$ INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash)
       VALUES ('00000000-0000-4000-8000-0000000003a2', 'data_created', 'five', %L, 'b5') $$,
    (SELECT current_hash FROM seal)
  ),
  'The next entry links to the seal'
);

-- An unbranched log, as most are, has one end: it becomes the head and
-- nothing is added.
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_keep_one_chain;
INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash, "timestamp") VALUES
  ('00000000-0000-4000-8000-0000000003a5', 'data_created', 'one', NULL, 's1', '2026-01-01T00:00:01Z'),
  ('00000000-0000-4000-8000-0000000003a5', 'data_created', 'two', 's1', 's2', '2026-01-01T00:00:02Z'),
  ('00000000-0000-4000-8000-0000000003a5', 'data_created', 'three', 's2', 's3', '2026-01-01T00:00:03Z');
-- A branched log whose newest end carries a time in the future.
INSERT INTO public.audit_logs (user_id, event_type, action, previous_hash, current_hash, "timestamp") VALUES
  ('00000000-0000-4000-8000-0000000003a6', 'data_created', 'one', NULL, 'f1', '2026-01-01T00:00:01Z'),
  ('00000000-0000-4000-8000-0000000003a6', 'data_created', 'two', 'f1', 'f2', '2026-01-01T00:00:02Z'),
  ('00000000-0000-4000-8000-0000000003a6', 'data_created', 'later', 'f1', 'f3', '2099-01-01T00:00:00.123456Z');
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_keep_one_chain;

SELECT is(public.seal_audit_chain_ends('00000000-0000-4000-8000-0000000003a5'), 0, 'An unbranched log has nothing to seal');
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs WHERE user_id = '00000000-0000-4000-8000-0000000003a5'),
  3,
  'Sealing an unbranched log adds no entry'
);
SELECT is(
  (SELECT head_hash FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a5'),
  's3',
  'Its last entry becomes the head'
);

SELECT is(public.seal_audit_chain_ends('00000000-0000-4000-8000-0000000003a6'), 1, 'A branch with a future time is sealed');
SELECT ok(
  (SELECT "timestamp" FROM public.audit_logs
   WHERE user_id = '00000000-0000-4000-8000-0000000003a6' AND event_type = 'audit_chain_sealed')
    > '2099-01-01T00:00:00.123456Z'::timestamptz,
  'The seal is timed after every entry, so it is also the newest by time'
);

-- 6. A person's own view ------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000003a1", "role": "authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.audit_chain_heads),
  1,
  'A person sees only their own head'
);

SELECT throws_ok(
  $$ UPDATE public.audit_chain_heads SET head_hash = 'planted' $$,
  '42501',
  NULL,
  'A person cannot move their head'
);

RESET ROLE;

-- 7. Deleting a person ----------------------------------------------------------

DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000003a3';

SELECT is(
  (SELECT count(*)::int FROM public.audit_chain_heads WHERE user_id = '00000000-0000-4000-8000-0000000003a3'),
  0,
  'Deleting a person deletes their head with their log'
);

SELECT * FROM finish();
ROLLBACK;
