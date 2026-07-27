import { NextResponse, type NextRequest } from "next/server";

import { toCsv } from "@/lib/csv";
import { isAppError } from "@/lib/api/errors";
import { resolveDays } from "@/features/analytics/format";
import { requireMerchantMember } from "@/server/policies/require-merchant";
import { getMerchantAnalytics, resolveRange } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { section: string; key: string; value: number };

/**
 * CSV export of a merchant's analytics (spec §8.14). Gated by merchant
 * membership (the merchant seam). Returns a `text/csv` download, or a plain-text
 * error with the policy's status on failure.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> },
): Promise<NextResponse> {
  const { merchantId } = await params;

  try {
    const ctx = await requireMerchantMember(merchantId);
    const days = resolveDays(request.nextUrl.searchParams.get("days") ?? undefined);
    const a = await getMerchantAnalytics(ctx.merchant.tenantId, merchantId, resolveRange(days));

    const rows: Row[] = [
      { section: "summary", key: "listing_views", value: a.totals.listingViews },
      { section: "summary", key: "unique_visitors", value: a.totals.uniqueVisitors },
      { section: "summary", key: "favourites", value: a.totals.favourites },
      { section: "summary", key: "qr_scans", value: a.totals.qrScans },
      { section: "summary", key: "shares", value: a.totals.shares },
      ...a.perEvent.flatMap((e) => [
        { section: "event_listing_views", key: e.eventName, value: e.listingViews },
        { section: "event_favourites", key: e.eventName, value: e.favourites },
        { section: "event_qr_scans", key: e.eventName, value: e.qrScans },
      ]),
    ];

    const csv = toCsv(rows, [
      { header: "section", value: (r) => r.section },
      { header: "key", value: (r) => r.key },
      { header: "value", value: (r) => r.value },
    ]);

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${ctx.merchant.slug}-analytics-${days}d.csv"`,
      },
    });
  } catch (error) {
    const status = isAppError(error) ? error.status : 500;
    const message = isAppError(error) ? error.message : "Could not export analytics.";
    return new NextResponse(message, { status });
  }
}
