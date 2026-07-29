import { NextResponse } from "next/server";

import { resolveAdClick } from "@/server/services/ads.service";

/**
 * Sponsor ad click-through (spec §8.x sponsors).
 *
 * Mirrors `/q` for QR codes: the visitor only ever sees our own short link, the
 * click is recorded server-side, and the destination is read from the booking's
 * **own row** — never from the query string. That's what keeps this from being
 * an open redirect: there is no caller-supplied target to abuse.
 *
 * An unknown, paused or out-of-flight booking 404s rather than explaining which,
 * the same way a draft event is indistinguishable from "not found".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const destination = await resolveAdClick(bookingId);
  if (!destination) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.redirect(destination, { status: 302 });
}
