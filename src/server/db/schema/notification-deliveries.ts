import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { campaignMessages } from "./campaign-messages";
import { campaigns } from "./campaigns";
import { events } from "./events";
import { tenants } from "./tenants";
import { visitors } from "./visitors";
import type { CampaignChannel, DeliveryStatus } from "../../campaigns/status";

/**
 * One row per recipient per send (spec §8.12). The authoritative record behind
 * campaign reporting — `summariseDeliveries` rolls these statuses into the
 * delivery/open/click rates the organizer sees.
 *
 * `campaign_id` is **nullable** so transactional notifications (merchant
 * approved, voucher expiring — §8.12's other use cases) can reuse this table
 * later without a migration.
 *
 * In Phase 8 delivery is simulated: rows are written and marked `sent` without
 * contacting a provider. `provider` / `provider_ref` / `error` are populated for
 * real sends once an adapter lands behind the `EmailProvider` seam. Mutable
 * (status advances on open/click), so it carries the `updated_at` trigger.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => campaignMessages.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email").$type<CampaignChannel>(),
    status: text("status").notNull().default("queued").$type<DeliveryStatus>(),
    /** Which adapter handled it — `simulated` in Phase 8. */
    provider: text("provider"),
    providerRef: text("provider_ref"),
    error: text("error"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("notification_deliveries_campaign_idx").on(table.campaignId),
    index("notification_deliveries_campaign_status_idx").on(table.campaignId, table.status),
    index("notification_deliveries_visitor_idx").on(table.visitorId),
    index("notification_deliveries_tenant_idx").on(table.tenantId),
  ],
);

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
