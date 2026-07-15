import type { NextRequest } from "next/server";

/**
 * Rejects cross-site POSTs to state-changing/expensive routes. The session
 * cookie's SameSite=Lax default already blocks most cross-site form/fetch
 * submissions, but this adds an explicit check rather than relying on that
 * alone: a request with an Origin header that doesn't match our own host
 * is refused outright. Requests with no Origin header (some same-origin
 * server-to-server or older-browser cases) are allowed through; SameSite
 * is the backstop for those.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
