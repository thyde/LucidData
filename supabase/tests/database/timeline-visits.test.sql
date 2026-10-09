-- LD-214 timeline visits: a count a day, added to only by the server, and read
-- by product_metrics as visits per week.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.daily_counters', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.daily_counters', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.daily_counters', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.daily_counters', 'SELECT'),
  'Neither API role can read or change the counters'
);

SELECT ok(
  has_function_privilege('service_role', 'public.increment_daily_counter(text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.increment_daily_counter(text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.increment_daily_counter(text)', 'EXECUTE'),
  'Only the server can add to a counter'
);

SELECT columns_are(
  'public', 'daily_counters', ARRAY['day', 'counter', 'count'],
  'A counter row holds a day, a name, and a count, and nothing about a person'
);

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ SELECT public.increment_daily_counter('timeline_visit'); SELECT public.increment_daily_counter('timeline_visit') $$,
  'The server adds to the day''s count'
);

SELECT is(
  (SELECT count FROM public.daily_counters
   WHERE counter = 'timeline_visit' AND day = (NOW() AT TIME ZONE 'UTC')::date),
  2,
  'Each call adds one to the same row'
);

SELECT throws_ok(
  $$ SELECT public.increment_daily_counter('page_view') $$,
  '23514',
  NULL,
  'Only a named counter can be kept'
);

RESET ROLE;

-- A fixed past month, so no real row falls inside it.
INSERT INTO public.daily_counters (day, counter, count) VALUES
  ('2020-01-10', 'timeline_visit', 5),
  ('2020-01-20', 'timeline_visit', 9),
  ('2020-02-03', 'timeline_visit', 100);

SELECT is(
  (SELECT public.product_metrics('2020-01-01', '2020-02-01') -> 'timeline_visits'),
  '{"total": 14, "per_week": 3.2}'::jsonb,
  'product_metrics reports the period''s visits and visits per week'
);

SELECT * FROM finish();
ROLLBACK;
