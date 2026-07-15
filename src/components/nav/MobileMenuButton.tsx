"use client";

import { useMobileNav } from "@/components/nav/MobileNavContext";

export function MobileMenuButton() {
  const { setOpen } = useMobileNav();
  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open navigation menu"
      className="mr-2 rounded-lg border border-border p-1.5 text-ink md:hidden"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
