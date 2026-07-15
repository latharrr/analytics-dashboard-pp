import { createBrowserClient } from "@supabase/ssr";

/**
 * Anon-key client for the browser. Used only for the login form's
 * signInWithPassword/signOut calls, never for reading dashboard data.
 */
export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
