import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { qrCodes } from "./qr-codes";
import { tenants } from "./tenants";
import { visitors } from "./visitors";
import type { QrTargetType } from "../../analytics/taxonomy";

/**
 * One row per QR scan (spec §8.10). **Append-only** (created_at only). The
 * `short_code`/`target_type`/`target_id` are snapshotted so history survives a
 * later retarget of the `qr_codes` row. `country` is the only location stored —
 * an approximate country code from `x-vercel-ip-country`; precise geo is
 * deliberately never persisted (§8.10). Every scan also writes an
 * `analytics_events` `qr_scanned` row, so the analytics QR-scan count matches.
 */
export const qrScanEvents = pgTable(
  "qr_scan_events",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    qrCodeId: uuid("qr_code_id")
      .notNull()
      .references(() => qrCodes.id, { onDelete: "cascade" }),
    shortCode: text("short_code").notNull(),
    targetType: text("target_type").notNull().$type<QrTargetType>(),
    targetId: uuid("target_id"),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "set null" }),
    anonymousId: text("anonymous_id"),
    deviceType: text("device_type"),
    browser: text("browser"),
    referrer: text("referrer"),
    country: text("country"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("qr_scan_events_qr_code_idx").on(table.qrCodeId),
    index("qr_scan_events_event_idx").on(table.eventId),
    index("qr_scan_events_tenant_idx").on(table.tenantId),
  ],
);

export type QrScanEvent = typeof qrScanEvents.$inferSelect;
export type NewQrScanEvent = typeof qrScanEvents.$inferInsert;
