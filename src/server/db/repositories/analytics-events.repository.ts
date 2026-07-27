import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  analyticsEvents,
  events,
  merchantCategories,
  merchants,
  tenants,
  type NewAnalyticsEvent,
} from "@/server/db/schema";

/**
 * The raw analytics log (spec §25). Append-only writes plus the grouped-count
 * reads the dashboards run **live** over the log — so their totals match it by
 * construction (the §34 exit criterion). Every read is scoped by `tenant_id`
 * (isolation) and a `[from, to)` time window.
 */

export type TimeRange = { from: Date; to: Date };
export type NameCount = { name: string; count: number };

/** Records one analytics event. Best-effort at the call sites; throws on real DB errors. */
export async function insertAnalyticsEvent(row: NewAnalyticsEvent): Promise<void> {
  await db.insert(analyticsEvents).values(row);
}

function eventWindow(tenantId: string, eventId: string, range: TimeRange) {
  return and(
    eq(analyticsEvents.tenantId, tenantId),
    eq(analyticsEvents.eventId, eventId),
    gte(analyticsEvents.occurredAt, range.from),
    lt(analyticsEvents.occurredAt, range.to),
  );
}

// --- Organizer (event) dashboard -------------------------------------------

/** Count of each event name for an event in the window. */
export async function countEventsByName(
  tenantId: string,
  eventId: string,
  range: TimeRange,
): Promise<NameCount[]> {
  return db
    .select({ name: analyticsEvents.name, count: count() })
    .from(analyticsEvents)
    .where(eventWindow(tenantId, eventId, range))
    .groupBy(analyticsEvents.name);
}

/** Distinct anonymous visitors for an event in the window. */
export async function countDistinctVisitorsForEvent(
  tenantId: string,
  eventId: string,
  range: TimeRange,
): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(analyticsEvents.anonymousId) })
    .from(analyticsEvents)
    .where(eventWindow(tenantId, eventId, range));
  return row?.value ?? 0;
}

/** Breakdown by a coarse dimension (device type or traffic source). */
export async function countEventsByDimension(
  tenantId: string,
  eventId: string,
  range: TimeRange,
  dimension: "device_type" | "source",
): Promise<{ key: string; count: number }[]> {
  const column = dimension === "device_type" ? analyticsEvents.deviceType : analyticsEvents.source;
  const rows = await db
    .select({ key: column, count: count() })
    .from(analyticsEvents)
    .where(eventWindow(tenantId, eventId, range))
    .groupBy(column)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({ key: r.key ?? "unknown", count: r.count }));
}

/** Top merchants by listing view (`merchant_viewed`) for an event. */
export async function topMerchantsForEvent(
  tenantId: string,
  eventId: string,
  range: TimeRange,
  limit = 10,
): Promise<{ merchantId: string; merchantName: string; views: number }[]> {
  return db
    .select({ merchantId: merchants.id, merchantName: merchants.name, views: count() })
    .from(analyticsEvents)
    .innerJoin(merchants, eq(merchants.id, analyticsEvents.merchantId))
    .where(and(eventWindow(tenantId, eventId, range), eq(analyticsEvents.name, "merchant_viewed")))
    .groupBy(merchants.id, merchants.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

/** Top merchant categories by listing view for an event. */
export async function topCategoriesForEvent(
  tenantId: string,
  eventId: string,
  range: TimeRange,
  limit = 10,
): Promise<{ category: string; views: number }[]> {
  return db
    .select({ category: merchantCategories.name, views: count() })
    .from(analyticsEvents)
    .innerJoin(merchants, eq(merchants.id, analyticsEvents.merchantId))
    .innerJoin(merchantCategories, eq(merchantCategories.id, merchants.categoryId))
    .where(and(eventWindow(tenantId, eventId, range), eq(analyticsEvents.name, "merchant_viewed")))
    .groupBy(merchantCategories.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

/** Top search keywords (from `search_performed` props.q) for an event. */
export async function topSearchKeywordsForEvent(
  tenantId: string,
  eventId: string,
  range: TimeRange,
  limit = 10,
): Promise<{ keyword: string; count: number }[]> {
  const keyword = sql<string>`lower(trim(${analyticsEvents.props} ->> 'q'))`;
  return db
    .select({ keyword, count: count() })
    .from(analyticsEvents)
    .where(
      and(
        eventWindow(tenantId, eventId, range),
        eq(analyticsEvents.name, "search_performed"),
        sql`length(trim(coalesce(${analyticsEvents.props} ->> 'q', ''))) > 0`,
      ),
    )
    .groupBy(keyword)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

/** Daily-active-users series: per day, distinct visitors and total events. */
export async function dailySeriesForEvent(
  tenantId: string,
  eventId: string,
  range: TimeRange,
): Promise<{ day: string; uniques: number; total: number }[]> {
  const day = sql<string>`to_char(date_trunc('day', ${analyticsEvents.occurredAt}), 'YYYY-MM-DD')`;
  return db
    .select({
      day,
      uniques: countDistinct(analyticsEvents.anonymousId),
      total: count(),
    })
    .from(analyticsEvents)
    .where(eventWindow(tenantId, eventId, range))
    .groupBy(day)
    .orderBy(day);
}

// --- Merchant dashboard -----------------------------------------------------

function merchantWindow(tenantId: string, merchantId: string, range: TimeRange) {
  return and(
    eq(analyticsEvents.tenantId, tenantId),
    eq(analyticsEvents.merchantId, merchantId),
    gte(analyticsEvents.occurredAt, range.from),
    lt(analyticsEvents.occurredAt, range.to),
  );
}

/** Distinct anonymous visitors who engaged with a merchant in the window. */
export async function countDistinctVisitorsForMerchant(
  tenantId: string,
  merchantId: string,
  range: TimeRange,
): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(analyticsEvents.anonymousId) })
    .from(analyticsEvents)
    .where(merchantWindow(tenantId, merchantId, range));
  return row?.value ?? 0;
}

/** Count of each event name for a merchant (across all its participations). */
export async function countMerchantEventsByName(
  tenantId: string,
  merchantId: string,
  range: TimeRange,
): Promise<NameCount[]> {
  return db
    .select({ name: analyticsEvents.name, count: count() })
    .from(analyticsEvents)
    .where(merchantWindow(tenantId, merchantId, range))
    .groupBy(analyticsEvents.name);
}

/** Per-event breakdown of a merchant's engagement. */
export async function merchantEventsPerEvent(
  tenantId: string,
  merchantId: string,
  range: TimeRange,
): Promise<{ eventId: string; eventName: string; name: string; count: number }[]> {
  return db
    .select({
      eventId: events.id,
      eventName: events.name,
      name: analyticsEvents.name,
      count: count(),
    })
    .from(analyticsEvents)
    .innerJoin(events, eq(events.id, analyticsEvents.eventId))
    .where(and(merchantWindow(tenantId, merchantId, range), isNotNull(analyticsEvents.eventId)))
    .groupBy(events.id, events.name, analyticsEvents.name);
}

// --- Platform-admin (cross-tenant) ----------------------------------------
//
// Read **live from the raw log** across all tenants, like the per-tenant
// dashboards, so the platform totals match the log by construction. These are
// **platform-admin only** and deliberately unscoped (the §3.2 platform-authority
// axis); callers must gate with `requirePlatformAdmin`.

/** Total tracked events + distinct anonymous visitors across the whole platform. */
export async function platformAnalyticsTotals(): Promise<{
  totalEvents: number;
  uniqueVisitors: number;
}> {
  const [row] = await db
    .select({
      totalEvents: count(),
      uniqueVisitors: countDistinct(analyticsEvents.anonymousId),
    })
    .from(analyticsEvents);
  return { totalEvents: row?.totalEvents ?? 0, uniqueVisitors: row?.uniqueVisitors ?? 0 };
}

/** The most frequent event names across the platform. */
export async function platformEventsByName(limit = 8): Promise<NameCount[]> {
  return db
    .select({ name: analyticsEvents.name, count: count() })
    .from(analyticsEvents)
    .groupBy(analyticsEvents.name)
    .orderBy(desc(count()))
    .limit(Math.min(limit, 50));
}

export type TenantEngagement = {
  tenantId: string;
  tenantName: string | null;
  totalEvents: number;
  uniqueVisitors: number;
};

/** Per-tenant engagement (total events + unique visitors), busiest first. */
export async function platformEventsPerTenant(): Promise<TenantEngagement[]> {
  return db
    .select({
      tenantId: analyticsEvents.tenantId,
      tenantName: tenants.name,
      totalEvents: count(),
      uniqueVisitors: countDistinct(analyticsEvents.anonymousId),
    })
    .from(analyticsEvents)
    .leftJoin(tenants, eq(tenants.id, analyticsEvents.tenantId))
    .groupBy(analyticsEvents.tenantId, tenants.name)
    .orderBy(desc(count()));
}
