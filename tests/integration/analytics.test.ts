import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { analyticsEvents, dailyMerchantMetrics, qrScanEvents, tenants } from "@/server/db/schema";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import { insertMerchant } from "@/server/db/repositories/merchants.repository";
import { insertParticipation } from "@/server/db/repositories/participations.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import { insertAnalyticsEvent } from "@/server/db/repositories/analytics-events.repository";
import { listDailyEventMetric } from "@/server/db/repositories/daily-metrics.repository";
import { findQrCodeByShortCode, insertQrCode } from "@/server/db/repositories/qr-codes.repository";
import type { AnalyticsEventName } from "@/server/analytics/taxonomy";
import { getEventAnalytics, getMerchantAnalytics } from "@/server/services/analytics.service";
import { runDailyAggregation } from "@/server/services/analytics-aggregation.service";
import { resolveScan } from "@/server/services/qr.service";

/**
 * Phase 7's slice (spec §25, §8.13, §8.10, §34): live-from-raw dashboards,
 * tenant isolation, the daily rollup reproducing the raw counts ("metrics match
 * raw event logs"), and the QR scan pipeline. Runs against the seeded live
 * database; skips otherwise. The header-reading capture path
 * (`recordTrackedEvent` / `captureRequestSignals`) is exercised by e2e; here we
 * drive the header-free writer + reads directly.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

const DAY = "2019-06-15";
const AT = new Date("2019-06-15T10:00:00Z");
const range = { from: new Date("2019-06-15T00:00:00Z"), to: new Date("2019-06-16T00:00:00Z") };
const signals = { deviceType: "mobile", browser: "Safari", referrer: null, source: "direct" };

describe.skipIf(!hasDb)("analytics, rollups & QR (integration)", () => {
  const createdTenantIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let tenantA = "";
  let tenantB = "";
  let eventA = "";
  let eventB = "";
  let merchantA = "";
  let participationA = "";

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    const [ta, tb] = await Promise.all([
      insertTenant({ name: "An A", slug: `an-a-${stamp}`, createdBy: owner.id }),
      insertTenant({ name: "An B", slug: `an-b-${stamp}`, createdBy: owner.id }),
    ]);
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    const [ea, eb] = await Promise.all([
      createEventWithDefaults({ tenantId: tenantA, name: "An Ev A", slug: `an-ev-a-${stamp}`, createdBy: owner.id }),
      createEventWithDefaults({ tenantId: tenantB, name: "An Ev B", slug: `an-ev-b-${stamp}`, createdBy: owner.id }),
    ]);
    eventA = ea.id;
    eventB = eb.id;

    const merchant = await insertMerchant({ tenantId: tenantA, name: "An M", slug: `an-m-${stamp}` });
    merchantA = merchant.id;
    const participation = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: merchantA,
      approvalStatus: "approved",
    });
    participationA = participation.id;

    const evt = (name: AnalyticsEventName, anon: string, withMerchant = false, props?: Record<string, unknown>) =>
      insertAnalyticsEvent({
        tenantId: tenantA,
        eventId: eventA,
        merchantId: withMerchant ? merchantA : null,
        participationId: withMerchant ? participationA : null,
        anonymousId: anon,
        name,
        props: props ?? null,
        occurredAt: AT,
      });

    // eventA: 3 event_viewed (2 unique), 2 merchant_viewed, 1 search, 1 favourite.
    await Promise.all([
      evt("event_viewed", "a1"),
      evt("event_viewed", "a2"),
      evt("event_viewed", "a1"),
      evt("merchant_viewed", "a1", true),
      evt("merchant_viewed", "a1", true),
      evt("search_performed", "a2", false, { q: "satay" }),
      evt("merchant_favourited", "a2", true),
      // eventB (other tenant) — must never appear in tenant A's numbers.
      insertAnalyticsEvent({ tenantId: tenantB, eventId: eventB, anonymousId: "b1", name: "event_viewed", occurredAt: AT }),
    ]);
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it("aggregates an event's engagement live from the raw log", async () => {
    const a = await getEventAnalytics(tenantA, eventA, range);
    expect(a.totals.eventViews).toBe(3);
    expect(a.totals.merchantViews).toBe(2);
    expect(a.totals.searches).toBe(1);
    expect(a.totals.favourites).toBe(1);
    expect(a.totals.uniqueVisitors).toBe(2);
    expect(a.totals.totalEvents).toBe(7);
    expect(a.topMerchants[0]?.views).toBe(2);
    expect(a.topKeywords[0]?.keyword).toBe("satay");
  });

  it("isolates analytics by tenant", async () => {
    // Tenant B querying tenant A's event, and vice versa, see nothing.
    expect((await getEventAnalytics(tenantB, eventA, range)).totals.totalEvents).toBe(0);
    expect((await getEventAnalytics(tenantA, eventB, range)).totals.totalEvents).toBe(0);
  });

  it("aggregates a merchant's listing engagement", async () => {
    const m = await getMerchantAnalytics(tenantA, merchantA, range);
    expect(m.totals.listingViews).toBe(2);
    expect(m.totals.favourites).toBe(1);
    expect(m.totals.uniqueVisitors).toBe(2);
    expect(m.perEvent[0]?.listingViews).toBe(2);
  });

  it("reproduces the live counts in the daily rollup (metrics match raw logs)", async () => {
    await runDailyAggregation(DAY);

    const valueOf = async (metric: string) =>
      (await listDailyEventMetric(tenantA, eventA, metric, DAY, DAY))[0]?.value ?? 0;

    expect(await valueOf("event_viewed")).toBe(3);
    expect(await valueOf("merchant_viewed")).toBe(2);
    expect(await valueOf("unique_visitors")).toBe(2);
    expect(await valueOf("total_events")).toBe(7);

    const [merchantRow] = await db
      .select({ value: dailyMerchantMetrics.value })
      .from(dailyMerchantMetrics)
      .where(
        and(
          eq(dailyMerchantMetrics.participationId, participationA),
          eq(dailyMerchantMetrics.date, DAY),
          eq(dailyMerchantMetrics.metric, "merchant_viewed"),
        ),
      );
    expect(merchantRow?.value).toBe(2);
  });

  // Several sequential round-trips to the remote pooler — allow more than the 5s default.
  it("logs a QR scan end-to-end", { timeout: 30_000 }, async () => {
    const shortCode = `scan-${stamp}`;
    await insertQrCode({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: merchantA,
      participationId: participationA,
      shortCode,
      targetType: "merchant",
      targetId: participationA,
      targetPath: `/an-a-${stamp}/an-ev-a-${stamp}/an-m-${stamp}`,
    });

    const result = await resolveScan({
      shortCode,
      anonymousId: "scan-visitor",
      signals,
      country: "MY",
      now: new Date(),
    });
    expect(result?.targetPath).toBe(`/an-a-${stamp}/an-ev-a-${stamp}/an-m-${stamp}`);

    // Denormalized counter bumped, a scan row written, and an analytics mirror.
    const code = await findQrCodeByShortCode(shortCode);
    expect(code?.scanCount).toBe(1);

    const [scans] = await db
      .select({ n: count() })
      .from(qrScanEvents)
      .where(eq(qrScanEvents.shortCode, shortCode));
    expect(scans?.n).toBe(1);

    const [mirror] = await db
      .select({ n: count() })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.merchantId, merchantA), eq(analyticsEvents.name, "qr_scanned")));
    expect(mirror?.n).toBe(1);
  });

  it("ignores an unknown or disabled code", { timeout: 30_000 }, async () => {
    expect(await resolveScan({ shortCode: "does-not-exist", anonymousId: null, signals, country: null, now: new Date() })).toBeNull();

    const disabled = `off-${stamp}`;
    await insertQrCode({
      tenantId: tenantA,
      eventId: eventA,
      shortCode: disabled,
      targetType: "event",
      targetId: eventA,
      targetPath: `/an-a-${stamp}/an-ev-a-${stamp}`,
      isActive: false,
    });
    expect(await resolveScan({ shortCode: disabled, anonymousId: null, signals, country: null, now: new Date() })).toBeNull();
  });
});
