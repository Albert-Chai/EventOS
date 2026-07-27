import { db } from "@/server/db";
import { qrScanEvents, type NewQrScanEvent } from "@/server/db/schema";

/**
 * QR scan log (spec §8.10). Append-only; one row per scan, written by the `/q`
 * redirect alongside the `scan_count` bump and the `analytics_events` mirror.
 */
export async function insertQrScanEvent(row: NewQrScanEvent): Promise<void> {
  await db.insert(qrScanEvents).values(row);
}
