import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { insertAnalyticsEvent } from "@/server/db/repositories/analytics-events.repository";
import { insertInvoice } from "@/server/db/repositories/invoices.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertSubscription } from "@/server/db/repositories/subscriptions.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import {
  getPlatformAnalytics,
  getPlatformBilling,
  getPlatformUsage,
} from "@/server/services/platform-metrics.service";

/**
 * The platform-admin console reads (see `docs/platform-admin-plan.md`). These are
 * global aggregations, so instead of asserting brittle platform totals we create
 * one throwaway tenant with a known subscription + paid invoice + two tracked
 * events, then assert on *its own* row and that global totals are ≥ its
 * contribution. Scoped to that tenant for cleanup via cascade. Skips without
 * `DIRECT_DATABASE_URL`.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);
const stamp = String(Date.now()).slice(-9);

describe.skipIf(!hasDb)("platform admin console (integration)", () => {
  const createdTenantIds: string[] = [];
  let tenantId = "";
  const invoiceCents = 299_900;

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    const t = await insertTenant({ name: "Plat Co", slug: `plat-${stamp}`, createdBy: owner.id });
    tenantId = t.id;
    createdTenantIds.push(tenantId);

    const now = new Date();
    const sub = await insertSubscription({
      tenantId,
      planKey: "growth",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
    await insertInvoice({
      tenantId,
      subscriptionId: sub.id,
      planKey: "growth",
      number: `INV-PLAT-${stamp}`,
      amountCents: invoiceCents,
      currency: "MYR",
      status: "paid",
      paidAt: now,
    });

    // Two tracked events from two distinct anonymous visitors.
    await insertAnalyticsEvent({ tenantId, name: "event_viewed", anonymousId: `plat-v1-${stamp}` });
    await insertAnalyticsEvent({ tenantId, name: "event_viewed", anonymousId: `plat-v2-${stamp}` });
  }, 30_000);

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  }, 30_000);

  it("billing surfaces the tenant's plan and folds its invoice into revenue", { timeout: 30_000 }, async () => {
    const billing = await getPlatformBilling();

    const row = billing.rows.find((r) => r.tenantId === tenantId);
    expect(row).toBeDefined();
    expect(row?.planName).toBe("Growth");
    expect(row?.status).toBe("active");
    expect(row?.paying).toBe(true);

    // Global totals include ours (plus seed/others), so assert monotonic bounds.
    expect(billing.revenueCents).toBeGreaterThanOrEqual(invoiceCents);
    expect(billing.paidInvoiceCount).toBeGreaterThanOrEqual(1);
    expect(billing.payingCount).toBeGreaterThanOrEqual(1);
    expect(billing.distribution.find((d) => d.key === "growth")?.count).toBeGreaterThanOrEqual(1);
  });

  it("usage exposes the tenant's hard, non-per-event metrics against its plan", { timeout: 30_000 }, async () => {
    const usage = await getPlatformUsage();

    const row = usage.rows.find((r) => r.tenantId === tenantId);
    expect(row).toBeDefined();
    expect(row?.planName).toBe("Growth");
    // Exactly the hard, non-per-event metrics: events, team members, storage.
    expect(row?.metrics.map((m) => m.metric).sort()).toEqual([
      "events",
      "storage_bytes",
      "team_members",
    ]);
    // Fresh tenant: nothing created, nothing over limit.
    expect(row?.over).toBe(0);
    expect(row?.metrics.every((m) => !m.perEvent && m.hard)).toBe(true);
  });

  it("analytics reports the tenant's engagement live from the raw log", { timeout: 30_000 }, async () => {
    const analytics = await getPlatformAnalytics();

    const row = analytics.perTenant.find((t) => t.tenantId === tenantId);
    expect(row).toBeDefined();
    expect(row?.totalEvents).toBe(2);
    expect(row?.uniqueVisitors).toBe(2);

    expect(analytics.totalEvents).toBeGreaterThanOrEqual(2);
    expect(analytics.uniqueVisitors).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(analytics.byName)).toBe(true);
  });
});
