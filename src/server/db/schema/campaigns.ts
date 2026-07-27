import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";
import type { CampaignChannel, CampaignStatus } from "../../campaigns/status";

/**
 * A campaign (spec §8.12, §34 Phase 8). Tenant + event scoped.
 *
 * `recipient_count` / `sent_count` / `failed_count` are denormalized rollups of
 * `notification_deliveries`, written when the send settles so the list view
 * doesn't aggregate per row; the deliveries stay authoritative and the report
 * recomputes from them.
 *
 * Delivery is **simulated** in Phase 8 — `sent_count` means "deliveries
 * recorded", not "mail accepted by a provider". The UI says so explicitly.
 * `created_by` gets its `auth.users` FK in the hand-written migration.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    channel: text("channel").notNull().default("email").$type<CampaignChannel>(),
    status: text("status").notNull().default("draft").$type<CampaignStatus>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (table) => [
    index("campaigns_event_idx").on(table.eventId),
    index("campaigns_tenant_idx").on(table.tenantId),
    index("campaigns_event_status_idx").on(table.eventId, table.status),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
