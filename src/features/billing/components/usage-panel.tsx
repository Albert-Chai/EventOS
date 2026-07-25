import { cn } from "@/lib/utils";
import type { MetricUsage } from "@/server/services/usage.service";

import { formatMetricValue } from "../format";

/**
 * Usage-vs-limit bars for every §22 metric. Soft metrics (email, SMS, …) show
 * their totals and warnings but never block; the four hard metrics are the ones
 * enforced on create. An 80% bar warns; over-limit turns red.
 */
export function UsagePanel({ usage }: { usage: MetricUsage[] }) {
  return (
    <ul className="grid gap-3">
      {usage.map((u) => {
        const unlimited = u.limit == null;
        const pct = unlimited ? 0 : Math.min(100, Math.round(u.ratio * 100));
        const limitLabel = unlimited ? "Unlimited" : formatMetricValue(u.limit as number, u.unit);
        const barColor = u.over ? "bg-red-500" : u.warn ? "bg-amber-500" : "bg-foreground";
        return (
          <li key={u.metric} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">
                {u.label}
                {u.perEvent ? (
                  <span className="text-muted-foreground font-normal"> · per event</span>
                ) : null}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatMetricValue(u.current, u.unit)} / {limitLabel}
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full transition-all", barColor)}
                style={{ width: `${unlimited ? 0 : pct}%` }}
              />
            </div>
            {u.over ? (
              <span className="text-xs text-red-600">Over your plan limit — upgrade to add more.</span>
            ) : u.warn ? (
              <span className="text-xs text-amber-600">Approaching your limit ({pct}%).</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
