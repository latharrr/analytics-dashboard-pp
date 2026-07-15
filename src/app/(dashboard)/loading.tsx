import { Spinner } from "@/components/Spinner";

// Next.js shows this automatically (via Suspense) while a dashboard page's
// server-side data fetch is in flight, so clicking a nav link never feels
// like nothing happened. The Sidebar/header stay put; only this area shows.
export default function DashboardLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <Spinner className="h-5 w-5 text-accent" />
        Loading…
      </div>
    </div>
  );
}
