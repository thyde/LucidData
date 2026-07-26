-- LD-109 platform abuse controls.
--
-- Three live defects let an anonymous stranger use LucidData against its own
-- users: organization registration was unauthenticated and returned a working
-- API key, plan quotas were never enforced, and nothing was rate limited.
--
-- This adds the shared rate-limit store. The application changes (authenticated
-- registration, verified-before-contact, quota enforcement) ship alongside it.

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- RLS on with no policy: only the service role reaches this table, and it is
-- never read through PostgREST by an API role.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limit_window
  ON public.rate_limit_counters(window_start);

-- Atomic consume-one-token. Returns TRUE while the caller is inside the limit
-- for the current fixed window, FALSE once the limit is exceeded. Counting in
-- the database rather than in process memory is what makes the limit hold
-- across serverless instances.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket TEXT,
  p_window_seconds INTEGER,
  p_limit INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_counters (bucket, window_start, count)
  VALUES (p_bucket, v_window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = public.rate_limit_counters.count + 1
  RETURNING public.rate_limit_counters.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

-- Not an API surface: only the service role may consume tokens.
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
