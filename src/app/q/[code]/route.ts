import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/server/telemetry/logger";
import { captureRequestSignals } from "@/server/services/analytics.service";
import { resolveScan } from "@/server/services/qr.service";
import { readAnonymousId } from "@/server/services/visitor-identity.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The trackable QR redirect (spec §8.10). `GET /q/{code}` logs the scan
 * (`qr_scan_events` + a mirrored `analytics_events` row + the code's scan
 * counter) and 302s to the code's current destination. An unknown, disabled, or
 * expired code falls back to the app root rather than erroring — a human scanned
 * a physical code and should land *somewhere*. The scan's tenant scope comes from
 * the code's own row, never the request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;

  try {
    const [signals, anonymousId, headerList] = await Promise.all([
      captureRequestSignals(),
      readAnonymousId(),
      headers(),
    ]);
    // Approximate location only — a country code from the edge, never precise geo.
    const country = headerList.get("x-vercel-ip-country");

    const result = await resolveScan({
      shortCode: code,
      anonymousId,
      signals,
      country,
      now: new Date(),
    });

    const destination = result ? result.targetPath : "/";
    return NextResponse.redirect(new URL(destination, request.url), { status: 302 });
  } catch (error) {
    // Never leave a scanner staring at an error — log and send them home.
    logger.error("qr.redirect_failed", { code, error });
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }
}
