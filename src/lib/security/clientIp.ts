import type { NextRequest } from "next/server";

/** Best-effort client IP from Vercel's forwarded headers. Used only as a rate-limit key. */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const real = request.headers.get("x-real-ip");
  if (real) return real;

  return "unknown";
}
