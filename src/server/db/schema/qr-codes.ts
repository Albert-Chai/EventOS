import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";
import type { QrTargetType } from "../../analytics/taxonomy";

/**
 * A trackable QR code (spec §8.10). Every code resolves through `/q/{short_code}`,
 * so the destination can be **retargeted** (`target_path`), **disabled**
 * (`is_active`), or **expired** (`expires_at`) without reprinting it. Mutable, so
 * it carries the `updated_at` trigger. `scan_count` is a denormalized running
 * total for quick display; the authoritative scans live in `qr_scan_events`.
 * `created_by` gets its `auth.users` FK in the hand-written migration, alongside
 * the "one active code per target" partial unique index.
 */
export const qrCodes = pgTable(
  "qr_codes",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    participationId: uuid("participation_id").references(() => merchantEventParticipations.id, {
      onDelete: "cascade",
    }),
    shortCode: text("short_code").notNull(),
    targetType: text("target_type").notNull().$type<QrTargetType>(),
    targetId: uuid("target_id"),
    // The retargetable relative destination the redirect 302s to.
    targetPath: text("target_path").notNull(),
    label: text("label"),
    scanCount: integer("scan_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (table) => [
    unique("qr_codes_short_code_uq").on(table.shortCode),
    index("qr_codes_tenant_idx").on(table.tenantId),
    index("qr_codes_event_idx").on(table.eventId),
    index("qr_codes_merchant_idx").on(table.merchantId),
  ],
);

export type QrCode = typeof qrCodes.$inferSelect;
export type NewQrCode = typeof qrCodes.$inferInsert;
