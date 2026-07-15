"use client";

import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browserClient";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-raised"
    >
      Sign out
    </button>
  );
}
