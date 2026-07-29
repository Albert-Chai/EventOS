"use server";

import { recordAdImpression } from "@/server/services/ads.service";

/**
 * Public ad beacon (docs/phase-9-sponsor-ads-plan.md §3).
 *
 * The caller may only name a **booking id**; the tenant, event, sponsor and slot
 * are all read from that booking's own row inside the service — the same seam
 * `/q` uses for QR scans, so a client can never assert who an impression belongs
 * to. Best-effort: it never throws to the visitor.
 */
export async function recordAdImpressionAction(bookingId: string): Promise<void> {
  if (typeof bookingId !== "string" || bookingId.length === 0) return;
  try {
    await recordAdImpression(bookingId);
  } catch {
    // Telemetry must never break the page it's measuring.
  }
}
