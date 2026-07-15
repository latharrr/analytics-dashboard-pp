import { getRefreshInfo } from "@/lib/db/kpi";
import { formatRelativeTime } from "@/lib/format";

export async function RefreshBadge() {
  const info = await getRefreshInfo();

  return (
    <span
      className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs text-ink-muted"
      title={info ? new Date(info.refreshed_at).toLocaleString() : undefined}
    >
      Last refreshed: {info ? formatRelativeTime(info.refreshed_at) : "never"}
    </span>
  );
}
