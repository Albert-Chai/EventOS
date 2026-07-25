import { and, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
import { usageRecords, type NewUsageRecord } from "@/server/db/schema";
import type { UsageMetric } from "@/server/billing/plans";

/**
 * The usage ledger (spec §22). Append-only: `insertUsageRecord` adds a metered
 * event, `sumUsage` totals a metric for a tenant (optionally within an event or a
 * monthly `period`). The "live" metrics (events, merchants, team, storage) are
 * counted from their own tables elsewhere and never touch this ledger.
 */

export async function insertUsageRecord(input: NewUsageRecord): Promise<void> {
  await db.insert(usageRecords).values(input);
}

export async function sumUsage(
  tenantId: string,
  metric: UsageMetric,
  opts: { eventId?: string; period?: string } = {},
): Promise<number> {
  const conditions: SQL[] = [eq(usageRecords.tenantId, tenantId), eq(usageRecords.metric, metric)];
  if (opts.eventId) conditions.push(eq(usageRecords.eventId, opts.eventId));
  if (opts.period) conditions.push(eq(usageRecords.period, opts.period));

  const [row] = await db
    .select({ value: sql<string>`coalesce(sum(${usageRecords.quantity}), 0)` })
    .from(usageRecords)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}
