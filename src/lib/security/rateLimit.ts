import { getServiceClient } from "@/lib/supabase/server";

export interface RateLimitOptions {
  /** Distinguishes routes sharing the same IP, e.g. "explorer" vs "explorer-csv". */
  route: string;
  windowSeconds: number;
  maxRequests: number;
}

/**
 * Fixed-window rate limit backed by the analytics_rate_limits table +
 * analytics_rate_limit_hit() function (supabase/migrations/012). No Redis
 * per the fixed stack: this is a single atomic Postgres UPSERT instead.
 * Fails OPEN (allows the request) if the check itself errors, so a rate
 * limiter bug can't take the whole tool down.
 */
export async function checkRateLimit(identifier: string, opts: RateLimitOptions): Promise<boolean> {
  const supabase = getServiceClient();
  const key = `${opts.route}:${identifier}`;

  const { data, error } = await supabase.rpc("analytics_rate_limit_hit", {
    p_key: key,
    p_window_seconds: opts.windowSeconds,
    p_max_requests: opts.maxRequests,
  });

  if (error) {
    console.error("checkRateLimit failed, failing open:", error.message);
    return true;
  }

  return data === true;
}
