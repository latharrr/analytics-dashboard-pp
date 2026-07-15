-- Lightweight fixed-window rate limiter for /api/ai-query and
-- /api/explorer/*. No Redis per the fixed stack, so this uses a small
-- table + a single atomic UPSERT function instead. Written and read only
-- via the service-role client (src/lib/rateLimit.ts).
CREATE TABLE IF NOT EXISTS analytics_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count int NOT NULL DEFAULT 0
);

-- Atomically increments the counter for `p_key`, resetting it if the
-- window has elapsed, and returns whether the request is still within
-- the limit. A single UPSERT keeps this race-free under concurrent hits
-- on the same key (Postgres row-lock serializes conflicting writers).
CREATE OR REPLACE FUNCTION analytics_rate_limit_hit(
  p_key text,
  p_window_seconds int,
  p_max_requests int
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO analytics_rate_limits (key, window_start, request_count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
  SET request_count = CASE
        WHEN analytics_rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
          THEN 1
        ELSE analytics_rate_limits.request_count + 1
      END,
      window_start = CASE
        WHEN analytics_rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
          THEN now()
        ELSE analytics_rate_limits.window_start
      END
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;
