"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useMobileNav } from "@/components/nav/MobileNavContext";

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboards",
    items: [
      { href: "/", label: "Overview" },
      { href: "/executive", label: "Executive KPI" },
      { href: "/growth-dashboard", label: "Growth" },
      { href: "/activation", label: "Activation" },
      { href: "/engagement", label: "Engagement" },
      { href: "/retention", label: "Retention" },
      { href: "/new-user-activity", label: "New User Activity" },
      { href: "/new-user-locations", label: "New User Locations" },
    ],
  },
  {
    label: "Modules",
    items: [
      { href: "/pools", label: "Pools" },
      { href: "/chat", label: "Chat" },
      { href: "/trust", label: "Trust" },
      { href: "/monetization", label: "Monetization" },
      { href: "/matching", label: "Matching" },
      { href: "/ai-copilot", label: "AI/Copilot" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/explorer", label: "Data Explorer" },
      { href: "/schema", label: "Schema Browser" },
      { href: "/all-users", label: "All Users" },
      { href: "/direct-chats", label: "Direct Chats" },
      { href: "/pg-flat-leads", label: "PG / Flat Leads" },
      { href: "/pg-flat-engagement", label: "PG / Flat / Flatmate by User" },
      { href: "/verified-users", label: "Verified Users" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, setOpen } = useMobileNav();

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
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-56 -translate-x-full flex-col overflow-y-auto border-r border-border bg-surface-raised px-3 py-4 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          isOpen ? "translate-x-0" : ""
        }`}
      >
        <p className="mb-4 px-2 text-sm font-semibold text-ink">Picapool Analytics</p>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted/70">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-lg px-2 py-1 text-sm ${
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
          </div>
        ))}
      </nav>
    </>
  );
}
