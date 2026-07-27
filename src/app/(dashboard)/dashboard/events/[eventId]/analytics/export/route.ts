import { NextResponse, type NextRequest } from "next/server";

import { toCsv } from "@/lib/csv";
import { isAppError } from "@/lib/api/errors";
import { deviceLabel, resolveDays, sourceLabel } from "@/features/analytics/format";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermission } from "@/server/policies/require-user";
import { getEventAnalytics, resolveRange } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { section: string; key: string; value: number };

/**
 * CSV export of an event's analytics (spec §8.14). Gated by `analytics.export`.
 * Returns a `text/csv` download on success, or a plain-text error with the
 * policy's status on failure (never a stack trace). Long/tidy format — one row
 * per (section, key) — so it drops straight into a spreadsheet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<NextResponse> {
  const { eventId } = await params;

  try {
    const ctx = await requirePermission("analytics.export");

    const event = await findEventById(ctx.tenant.id, eventId);
    if (!event) return new NextResponse("Event not found.", { status: 404 });

    const days = resolveDays(request.nextUrl.searchParams.get("days") ?? undefined);
    const a = await getEventAnalytics(ctx.tenant.id, eventId, resolveRange(days));

    const rows: Row[] = [
      { section: "summary", key: "unique_visitors", value: a.totals.uniqueVisitors },
      { section: "summary", key: "total_events", value: a.totals.totalEvents },
      { section: "summary", key: "event_views", value: a.totals.eventViews },
      { section: "summary", key: "merchant_list_views", value: a.totals.listViews },
      { section: "summary", key: "merchant_views", value: a.totals.merchantViews },
      { section: "summary", key: "searches", value: a.totals.searches },
      { section: "summary", key: "filters", value: a.totals.filters },
      { section: "summary", key: "map_opens", value: a.totals.mapOpens },
      { section: "summary", key: "favourites", value: a.totals.favourites },
      { section: "summary", key: "qr_scans", value: a.totals.qrScans },
      { section: "summary", key: "shares", value: a.totals.shares },
      ...a.topMerchants.map((m) => ({ section: "top_merchant", key: m.merchantName, value: m.views })),
      ...a.topCategories.map((c) => ({ section: "top_category", key: c.category, value: c.views })),
      ...a.topKeywords.map((k) => ({ section: "top_search", key: k.keyword, value: k.count })),
      ...a.devices.map((d) => ({ section: "device", key: deviceLabel(d.key), value: d.count })),
      ...a.sources.map((s) => ({ section: "source", key: sourceLabel(s.key), value: s.count })),
      ...a.series.map((s) => ({ section: "daily_events", key: s.day, value: s.total })),
      ...a.series.map((s) => ({ section: "daily_unique_visitors", key: s.day, value: s.uniques })),
    ];

    const csv = toCsv(rows, [
      { header: "section", value: (r) => r.section },
      { header: "key", value: (r) => r.key },
      { header: "value", value: (r) => r.value },
    ]);

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="event-${event.slug}-analytics-${days}d.csv"`,
      },
    });
  } catch (error) {
    const status = isAppError(error) ? error.status : 500;
    const message = isAppError(error) ? error.message : "Could not export analytics.";
    return new NextResponse(message, { status });
  }
}
