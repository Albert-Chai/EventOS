import { headers } from "next/headers";

import { env } from "@/config/env";
import { deriveTrafficSource, parseUserAgent } from "@/lib/client-signals";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { findPublicParticipationByMerchantSlug } from "@/server/db/repositories/participations.repository";
import {
  countDistinctVisitorsForEvent,
  countDistinctVisitorsForMerchant,
  countEventsByDimension,
  countEventsByName,
  countMerchantEventsByName,
  dailySeriesForEvent,
  insertAnalyticsEvent,
  merchantEventsPerEvent,
  topCategoriesForEvent,
  topMerchantsForEvent,
  topSearchKeywordsForEvent,
  type NameCount,
  type TimeRange,
} from "@/server/db/repositories/analytics-events.repository";
import type { AnalyticsEventName, ClientTrackableEvent } from "@/server/analytics/taxonomy";
import { getOrSetAnonymousId } from "./visitor-identity.service";

/**
 * Analytics capture + dashboard reads (spec §25, §8.13).
 *
 * Writes are append-only to `analytics_events`; dashboards read **live** from the
 * same log, so their totals match it (the §34 exit criterion). The public capture
 * path resolves the tenant + event from the URL slugs (`findPublicEvent`), never a
 * client value — the §6 public-reads seam applied to writes.
 */

type AnalyticsWrite = {
  tenantId: string;
  eventId?: string | null;
  merchantId?: string | null;
  participationId?: string | null;
  itemId?: string | null;
  boothId?: string | null;
  zoneId?: string | null;
  visitorId?: string | null;
  anonymousId?: string | null;
  campaignId?: string | null;
  name: AnalyticsEventName;
  source?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  referrer?: string | null;
  props?: Record<string, unknown> | null;
};

/** The single low-level writer. All ids are server-derived by the caller. */
export async function recordAnalyticsEvent(input: AnalyticsWrite): Promise<void> {
  await insertAnalyticsEvent({
    tenantId: input.tenantId,
    eventId: input.eventId ?? null,
    merchantId: input.merchantId ?? null,
    participationId: input.participationId ?? null,
    itemId: input.itemId ?? null,
    boothId: input.boothId ?? null,
    zoneId: input.zoneId ?? null,
    visitorId: input.visitorId ?? null,
    anonymousId: input.anonymousId ?? null,
    campaignId: input.campaignId ?? null,
    name: input.name,
    source: input.source ?? null,
    deviceType: input.deviceType ?? null,
    browser: input.browser ?? null,
    referrer: input.referrer ?? null,
    props: input.props ?? null,
  });
}

export type RequestSignals = {
  deviceType: string;
  browser: string;
  referrer: string | null;
  source: string;
};

/** Coarse device / browser / traffic-source signals from the current request. */
export async function captureRequestSignals(): Promise<RequestSignals> {
  const headerList = await headers();
  const ua = headerList.get("user-agent");
  const referrer = headerList.get("referer") ?? headerList.get("referrer");
  const { deviceType, browser } = parseUserAgent(ua);
  let selfHost: string | null = null;
  try {
    selfHost = new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    selfHost = null;
  }
  return { deviceType, browser, referrer, source: deriveTrafficSource(referrer, selfHost) };
}

/**
 * The public beacon path (`trackEventAction`). Resolves the tenant + event (and
 * merchant) from slugs, mints the anonymous-id cookie without a DB visitor row,
 * captures signals, and records one event. Best-effort — never throws to the
 * visitor.
 */
export async function recordTrackedEvent(input: {
  name: ClientTrackableEvent;
  tenantSlug: string;
  eventSlug: string;
  merchantSlug?: string;
  props?: Record<string, unknown>;
}): Promise<void> {
  const event = await findPublicEvent(input.tenantSlug, input.eventSlug);
  if (!event) return; // Unknown/non-public target — nothing to attribute.

  let merchantId: string | null = null;
  let participationId: string | null = null;
  if (input.merchantSlug) {
    const listing = await findPublicParticipationByMerchantSlug(event.id, input.merchantSlug);
    if (listing) {
      merchantId = listing.merchant.id;
      participationId = listing.participationId;
    }
  }

  const [anonymousId, signals] = await Promise.all([getOrSetAnonymousId(), captureRequestSignals()]);

  await recordAnalyticsEvent({
    tenantId: event.tenantId,
    eventId: event.id,
    merchantId,
    participationId,
    anonymousId,
    name: input.name,
    deviceType: signals.deviceType,
    browser: signals.browser,
    referrer: signals.referrer,
    source: signals.source,
    props: input.props ?? null,
  });
}

// --- Dashboard reads --------------------------------------------------------

/** Resolves a `?days=` window to a `[from, to)` range ending now. */
export function resolveRange(days: number): TimeRange & { days: number } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

function pick(names: NameCount[], name: AnalyticsEventName): number {
  return names.find((n) => n.name === name)?.count ?? 0;
}

export type EventAnalytics = {
  totals: {
    totalEvents: number;
    uniqueVisitors: number;
    eventViews: number;
    listViews: number;
    merchantViews: number;
    searches: number;
    filters: number;
    mapOpens: number;
    favourites: number;
    qrScans: number;
    shares: number;
  };
  topMerchants: { merchantId: string; merchantName: string; views: number }[];
  topCategories: { category: string; views: number }[];
  topKeywords: { keyword: string; count: number }[];
  devices: { key: string; count: number }[];
  sources: { key: string; count: number }[];
  series: { day: string; uniques: number; total: number }[];
};

/** The organizer event dashboard, aggregated live from the raw log. */
export async function getEventAnalytics(
  tenantId: string,
  eventId: string,
  range: TimeRange,
): Promise<EventAnalytics> {
  const [names, uniqueVisitors, topMerchants, topCategories, topKeywords, devices, sources, series] =
    await Promise.all([
      countEventsByName(tenantId, eventId, range),
      countDistinctVisitorsForEvent(tenantId, eventId, range),
      topMerchantsForEvent(tenantId, eventId, range),
      topCategoriesForEvent(tenantId, eventId, range),
      topSearchKeywordsForEvent(tenantId, eventId, range),
      countEventsByDimension(tenantId, eventId, range, "device_type"),
      countEventsByDimension(tenantId, eventId, range, "source"),
      dailySeriesForEvent(tenantId, eventId, range),
    ]);

  const totalEvents = names.reduce((sum, n) => sum + n.count, 0);

  return {
    totals: {
      totalEvents,
      uniqueVisitors,
      eventViews: pick(names, "event_viewed"),
      listViews: pick(names, "merchant_list_viewed"),
      merchantViews: pick(names, "merchant_viewed"),
      searches: pick(names, "search_performed"),
      filters: pick(names, "filter_applied"),
      mapOpens: pick(names, "map_opened"),
      favourites: pick(names, "merchant_favourited"),
      qrScans: pick(names, "qr_scanned"),
      shares: pick(names, "share_clicked"),
    },
    topMerchants,
    topCategories,
    topKeywords,
    devices,
    sources,
    series,
  };
}

export type MerchantAnalytics = {
  totals: {
    listingViews: number;
    favourites: number;
    qrScans: number;
    shares: number;
    uniqueVisitors: number;
  };
  perEvent: {
    eventId: string;
    eventName: string;
    listingViews: number;
    favourites: number;
    qrScans: number;
  }[];
};

/** The merchant dashboard, aggregated live from the raw log. */
export async function getMerchantAnalytics(
  tenantId: string,
  merchantId: string,
  range: TimeRange,
): Promise<MerchantAnalytics> {
  const [names, uniqueVisitors, perEventRows] = await Promise.all([
    countMerchantEventsByName(tenantId, merchantId, range),
    countDistinctVisitorsForMerchant(tenantId, merchantId, range),
    merchantEventsPerEvent(tenantId, merchantId, range),
  ]);

  const perEventMap = new Map<
    string,
    { eventId: string; eventName: string; listingViews: number; favourites: number; qrScans: number }
  >();
  for (const row of perEventRows) {
    const entry = perEventMap.get(row.eventId) ?? {
      eventId: row.eventId,
      eventName: row.eventName,
      listingViews: 0,
      favourites: 0,
      qrScans: 0,
    };
    if (row.name === "merchant_viewed") entry.listingViews += row.count;
    else if (row.name === "merchant_favourited") entry.favourites += row.count;
    else if (row.name === "qr_scanned") entry.qrScans += row.count;
    perEventMap.set(row.eventId, entry);
  }

  return {
    totals: {
      listingViews: pick(names, "merchant_viewed"),
      favourites: pick(names, "merchant_favourited"),
      qrScans: pick(names, "qr_scanned"),
      shares: pick(names, "share_clicked"),
      uniqueVisitors,
    },
    perEvent: [...perEventMap.values()].sort((a, b) => b.listingViews - a.listingViews),
  };
}
