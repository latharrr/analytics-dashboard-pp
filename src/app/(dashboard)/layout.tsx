import { Suspense } from "react";
import { Sidebar } from "@/components/nav/Sidebar";
import { RefreshBadge } from "@/components/nav/RefreshBadge";
import { SignOutButton } from "@/components/nav/SignOutButton";
import { SignedInAs } from "@/components/nav/SignedInAs";
import { MobileNavProvider } from "@/components/nav/MobileNavContext";
import { MobileMenuButton } from "@/components/nav/MobileMenuButton";

// Every page here reads live data behind auth: never statically prerendered.
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center">
              <MobileMenuButton />
              <div className="min-w-0">
                <Suspense fallback={<span className="text-xs text-ink-muted">Loading…</span>}>
                  <RefreshBadge />
                </Suspense>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Suspense fallback={null}>
                <SignedInAs />
              </Suspense>
              <SignOutButton />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
