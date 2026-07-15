"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMobileNav } from "@/components/nav/MobileNavContext";

interface NavItem {
  href: string;
  label: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/executive", label: "Executive KPI" },
  { href: "/growth-dashboard", label: "Growth" },
  { href: "/activation", label: "Activation" },
  { href: "/engagement", label: "Engagement" },
  { href: "/retention", label: "Retention" },
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

// Reordering is a shared-browser display preference, not per-user data, so
// localStorage is enough: no settings table needed for a single-shared-login app.
const NAV_ORDER_STORAGE_KEY = "picapool_nav_order";

function loadOrder(): NavItem[] {
  if (typeof window === "undefined") return DEFAULT_NAV_ITEMS;
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_NAV_ITEMS;
    const savedHrefs: string[] = JSON.parse(raw);
    const byHref = new Map(DEFAULT_NAV_ITEMS.map((i) => [i.href, i]));
    const ordered = savedHrefs.map((href) => byHref.get(href)).filter((i): i is NavItem => Boolean(i));
    // Append any nav item not present in a saved order (e.g. added after a deploy).
    for (const item of DEFAULT_NAV_ITEMS) {
      if (!ordered.some((o) => o.href === item.href)) ordered.push(item);
    }
    return ordered;
  } catch {
    return DEFAULT_NAV_ITEMS;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, setOpen } = useMobileNav();
  const [items, setItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);

  // Reads localStorage after mount (SSR has no access to it); the initial
  // render matches DEFAULT_NAV_ITEMS on both server and client, so this
  // causes at most a harmless one-frame reorder flash, never a hydration mismatch.
  useEffect(() => {
    setItems(loadOrder());
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setItems(next);
    window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(next.map((i) => i.href)));
  }

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
          {items.map((item, index) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} className="group flex items-center gap-0.5">
                <Link
                  href={item.href}
                  className={`block flex-1 rounded-lg px-2 py-1.5 text-sm ${
                    active
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
                <div className="flex shrink-0 flex-col opacity-40 group-hover:opacity-100">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${item.label} up`}
                    className="px-1 text-xs leading-none text-ink-muted hover:text-ink disabled:opacity-0"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label={`Move ${item.label} down`}
                    className="px-1 text-xs leading-none text-ink-muted hover:text-ink disabled:opacity-0"
                  >
                    ▼
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
