export function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return value.toFixed(2);
    return new Intl.NumberFormat("en-US").format(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "string") {
    const asDate = Date.parse(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(asDate)) {
      return new Date(value).toLocaleString();
    }
    return value;
  }
  return String(value);
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
