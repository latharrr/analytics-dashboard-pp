import { getRetentionCohorts } from "@/lib/db/activityBreakdown";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { formatAsOf } from "@/lib/format";

function pct(retained: number, cohortSize: number): string {
  if (!cohortSize) return "N/A";
  return `${Math.round((retained / cohortSize) * 1000) / 10}%`;
}

export default async function RetentionPage() {
  const liveAsOf = new Date().toISOString();
  const cohorts = await getRetentionCohorts();

  return (
    <div>
      <KpiPageHeader
        title="Retention"
        description="Weekly signup cohorts vs. the % who took any proxy-activity action (chat, trust, pool) in each following week. Cohorts are fixed calendar weeks (Mon–Sun), so a cohort's size here won't match a rolling 'last 7 days' count on other tabs (e.g. New User Activity, Overview). No dedicated retention/session-event log exists yet, so this is built from those same activity signals."
      />
      <p className="mb-4 text-[11px] text-ink-muted/70">As of {formatAsOf(liveAsOf)}</p>

      {cohorts.length === 0 ? (
        <p className="text-sm text-ink-muted">No cohort data yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised">
              <tr>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Cohort week</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Cohort size</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Week 1</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Week 2</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Week 3</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Week 4</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortWeek} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap p-2 text-ink">{new Date(c.cohortWeek).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{c.cohortSize}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{pct(c.week1, c.cohortSize)}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{pct(c.week2, c.cohortSize)}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{pct(c.week3, c.cohortSize)}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{pct(c.week4, c.cohortSize)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
