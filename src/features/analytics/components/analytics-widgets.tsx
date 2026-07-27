import Link from "next/link";

import { cn } from "@/lib/utils";
import { formatCount } from "../format";

/**
 * Presentational widgets for the analytics dashboards (spec §8.13). Pure Server
 * Components — no interactivity — so they render on the server with the live data.
 */

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? formatCount(value) : value}
      </p>
      {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

/** A ranked list rendered as proportional bars. */
export function BarList({
  rows,
  emptyLabel = "No data yet.",
}: {
  rows: { label: string; value: number }[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="grid gap-2.5">
      {rows.map((row, i) => (
        <li key={`${row.label}-${i}`} className="grid gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {formatCount(row.value)}
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The daily-active-users series as a small bar chart (scrolls on narrow screens). */
export function DailySeries({
  series,
}: {
  series: { day: string; uniques: number; total: number }[];
}) {
  if (series.length === 0) {
    return <p className="text-muted-foreground text-sm">No activity in this period yet.</p>;
  }
  const max = Math.max(...series.map((s) => s.total), 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1" style={{ height: 128 }}>
        {series.map((s) => (
          <div
            key={s.day}
            className="flex h-full flex-col items-center justify-end gap-1"
            title={`${s.day}: ${s.uniques} unique visitors, ${s.total} events`}
          >
            <div
              className="bg-primary/80 w-3 shrink-0 rounded-t"
              style={{ height: `${Math.max((s.total / max) * 100, 2)}%` }}
            />
            <span className="text-muted-foreground text-[10px] whitespace-nowrap">
              {s.day.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The 7 / 30 / 90-day range selector — plain links, so it works without JS. */
export function RangeTabs({ current, baseHref }: { current: number; baseHref: string }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-sm">
      {[7, 30, 90].map((d) => (
        <Link
          key={d}
          href={`${baseHref}?days=${d}`}
          className={cn(
            "rounded-md px-3 py-1 transition-colors",
            d === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d}d
        </Link>
      ))}
    </div>
  );
}
