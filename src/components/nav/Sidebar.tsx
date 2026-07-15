"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useMobileNav } from "@/components/nav/MobileNavContext";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/pools", label: "Pools" },
  { href: "/chat", label: "Chat" },
  { href: "/trust", label: "Trust" },
  { href: "/monetization", label: "Monetization" },
  { href: "/matching", label: "Matching" },
  { href: "/ai-copilot", label: "AI/Copilot" },
  { href: "/explorer", label: "Data Explorer" },
  { href: "/ai-query", label: "AI Query" },
  { href: "/schema", label: "Schema Browser" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, setOpen } = useMobileNav();

  // Close the mobile drawer on every navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-64 -translate-x-full flex-col border-r border-border bg-surface-raised p-4 transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 ${
          isOpen ? "translate-x-0" : ""
        }`}
      >
        <p className="mb-4 px-2 text-sm font-semibold text-ink">Picapool Analytics</p>
        <ul className="flex-1 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-2 py-1.5 text-sm ${
                    active
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
